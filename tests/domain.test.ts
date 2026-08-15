/* Walks the pipeline the way the CLI and the runner do: validate a bank,
 * build a sitting from it, score a perfect attempt. */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { BuildSittingUseCase } from '../src/application/use-cases/build-sitting.ts';
import { ValidateBankUseCase } from '../src/application/use-cases/validate-bank.ts';
import { ScoreAttemptUseCase } from '../src/application/use-cases/score-attempt.ts';
import type { Responses } from '../src/domain/model/scoring.ts';
import { seededRandomFactory } from '../src/infrastructure/random/seeded-random.ts';

const bank = JSON.parse(await readFile(new URL('../data/example-winter-2023.json', import.meta.url), 'utf8'));

const build = new BuildSittingUseCase(seededRandomFactory);

test('the example bank validates', () => {
  const report = new ValidateBankUseCase().execute(bank);
  assert.deepEqual(report.problems, []);
  assert.ok(report.itemCount > 0);
});

test('a broken bank names the item and the problem', () => {
  const broken = structuredClone(bank);
  broken.sections[0].items[0].answer = 9;
  broken.sections[0].items[1].id = broken.sections[0].items[0].id;

  const report = new ValidateBankUseCase().execute(broken);
  assert.equal(report.valid, false);
  assert.ok(report.problems.some((p) => p.message.includes('answer חייב להיות 1–4')));
  assert.ok(report.problems.some((p) => p.message.includes('id כפול')));
});

test('a sitting keeps every stimulus in front of its questions', () => {
  const sitting = build.execute({ bank, seed: 'a' });
  const seen = new Set<string>();

  for (const step of sitting.steps) {
    if (step.kind === 'stimulus') seen.add(step.stimulusId);
    if (step.kind === 'item' && step.stimulusId) assert.ok(seen.has(step.stimulusId));
  }
  assert.equal(sitting.steps.at(-1)?.kind, 'end');
});

test('the same seed gives the same sitting, a different seed does not', () => {
  const ids = (seed: string) =>
    build
      .execute({ bank, blueprint: 'half', seed })
      .steps.filter((s) => s.kind === 'item')
      .map((s) => (s as { itemId: string }).itemId);

  assert.deepEqual(ids('a'), ids('a'));
  assert.equal(ids('half-a').length > 0, true);
});

test('the standard blueprint stays inside the session ceiling', () => {
  const sitting = build.execute({ bank, blueprint: 'standard', seed: 'a' });
  assert.equal(sitting.summary.overBudget, false);
  assert.ok(sitting.summary.totalSeconds <= sitting.summary.maxSeconds);
});

test('a short bank reports what it could not fill', () => {
  const sitting = build.execute({ bank, blueprint: 'standard', seed: 'a' });
  assert.ok(sitting.summary.notes.length > 0, 'the excerpt cannot fill a standard sitting');
});

test('skipping the writing task drops it and its break', () => {
  const withWriting = build.execute({ bank, seed: 'a' });
  const without = build.execute({ bank, seed: 'a', includeWriting: false });

  assert.ok(withWriting.steps.some((s) => s.kind === 'writing'));
  assert.ok(!without.steps.some((s) => s.kind === 'writing'));
  assert.ok(without.summary.totalSeconds < withWriting.summary.totalSeconds);
});

test('answering everything correctly scores 150 where the bank allows it', () => {
  const sitting = build.execute({ bank, seed: 'a' });
  const responses: Responses = {};
  for (const step of sitting.steps)
    if (step.kind === 'item') responses[step.itemId] = step.answer;

  const attempt = new ScoreAttemptUseCase().execute({ sitting, responses });
  assert.equal(attempt.score.raw.verbal, attempt.score.attempted.verbal);
  assert.ok(attempt.score.general.multi >= 200 && attempt.score.general.multi <= 800);
  assert.ok(attempt.score.detail.every((d) => d.correct));
});

test('an unanswered question scores as wrong, not as absent', () => {
  const sitting = build.execute({ bank, seed: 'a' });
  const attempt = new ScoreAttemptUseCase().execute({ sitting, responses: {} });

  assert.equal(attempt.score.raw.verbal, 0);
  assert.ok(attempt.score.attempted.verbal > 0);
  assert.ok(attempt.score.detail.every((d) => d.given === null && !d.correct));
});
