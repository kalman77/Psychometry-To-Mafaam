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

/* The published MAPAM counts describe the computerised test, which runs about
 * three and a half hours; the rulebook times are the accommodated paper ones,
 * roughly twice as long per question. The sitting therefore sits close to the
 * ceiling, and the longest writing task crosses it. What must not happen is
 * crossing it silently — the setup screen reads `overBudget` to warn. */
test('a sitting that outgrows the ceiling is flagged, not waved through', () => {
  const inside = [30, 35, 40].map((writingMinutes) =>
    build.execute({ bank, blueprint: 'standard', seed: 'a', writingMinutes }),
  );
  for (const sitting of inside) {
    assert.equal(sitting.summary.overBudget, false);
    assert.ok(sitting.summary.totalSeconds <= sitting.summary.maxSeconds);
  }

  const longest = build.execute({ bank, blueprint: 'standard', seed: 'a', writingMinutes: 45 });
  assert.equal(
    longest.summary.overBudget,
    longest.summary.totalSeconds > longest.summary.maxSeconds,
    'the flag has to agree with the clock, whichever way it falls',
  );
});

test('the half blueprint fits whatever writing task is chosen', () => {
  for (const writingMinutes of [30, 35, 40, 45]) {
    const sitting = build.execute({ bank, blueprint: 'half', seed: 'a', writingMinutes });
    assert.equal(sitting.summary.overBudget, false, `half should fit at ${writingMinutes} minutes`);
  }
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

/* The conversion tables are indexed by raw score on a full-length paper test,
 * but every real sitting is shorter than that. Scoring a short sitting straight
 * off the table reads the unasked questions as wrong: a flawless 65-question
 * MAPAM capped at 494 out of 800, which is what this pins down. */
test('a perfect sitting scores 800 whatever length it is', () => {
  for (const blueprint of ['standard', 'half', 'full'] as const) {
    const sitting = build.execute({ bank, blueprint, seed: 'a' });
    const responses: Responses = {};
    for (const step of sitting.steps)
      if (step.kind === 'item') responses[step.itemId] = step.answer;

    const { score } = new ScoreAttemptUseCase().execute({ sitting, responses });
    assert.equal(score.general.multi, 800, `${blueprint}: a perfect paper is a perfect score`);
    assert.deepEqual(score.uniform, { verbal: 150, quantitative: 150, english: 150 }, blueprint);
  }
});

test('a shorter sitting grades the same performance the same way', () => {
  // Half the answers right should land in the same region of the scale whether
  // the sitting asked 38 questions or 130 — the length is not the grade.
  const scores = (['standard', 'half', 'full'] as const).map((blueprint) => {
    const sitting = build.execute({ bank, blueprint, seed: 'a' });
    const responses: Responses = {};
    let n = 0;
    for (const step of sitting.steps)
      if (step.kind === 'item' && n++ % 2 === 0) responses[step.itemId] = step.answer;

    return new ScoreAttemptUseCase().execute({ sitting, responses }).score.general.multi;
  });

  const spread = Math.max(...scores) - Math.min(...scores);
  assert.ok(spread < 60, `lengths disagree by ${spread}: ${scores.join(', ')}`);
});

/* NITE publishes a different conversion table for every form of the test, and
 * the booklets print their own on the last pages. A bank that carries one must
 * be scored on it — using another sitting's table is worth about twenty points
 * in the middle of the scale. */
test('a bank is scored on its own conversion table', () => {
  const withScale = structuredClone(bank);
  // A table that pays 150 for a single right answer: unmistakable if honoured,
  // invisible if the built-in one is used instead.
  withScale.scale = {
    verbal: [50, 150],
    quantitative: [50, 150],
    english: [50, 150],
  };

  const sitting = build.execute({ bank: withScale, blueprint: 'standard', seed: 'a' });
  assert.deepEqual(sitting.scale, withScale.scale, 'the sitting carries the table');

  const responses: Responses = {};
  for (const step of sitting.steps)
    if (step.kind === 'item') responses[step.itemId] = step.answer;

  const { score } = new ScoreAttemptUseCase().execute({ sitting, responses });
  assert.deepEqual(score.uniform, { verbal: 150, quantitative: 150, english: 150 });
});

test('a bank without a table still scores on the built-in one', () => {
  const sitting = build.execute({ bank, blueprint: 'standard', seed: 'a' });
  assert.equal(sitting.scale, null);
  const { score } = new ScoreAttemptUseCase().execute({ sitting, responses: {} });
  assert.deepEqual(score.uniform, { verbal: 50, quantitative: 50, english: 50 });
});

/* Blueprint ranges: what a sitting asks varies, how long it runs does not. */

const resolvedCounts = (seed: string) => {
  const sitting = build.execute({ bank, blueprint: 'standard', seed });
  return sitting.resolvedBlueprint!;
};

test('two sittings of the same booklet are not the same paper', () => {
  const seeds = Array.from({ length: 40 }, (_, i) => `seed-${i}`);
  const analogies = new Set(seeds.map((seed) => resolvedCounts(seed).verbal!.analogy ?? 0));

  assert.ok(analogies.size > 1, `every seed drew the same count: ${[...analogies]}`);
  // And within the declared range, not wherever the trim happened to land.
  for (const count of analogies) assert.ok(count >= 8 && count <= 11, `analogy ${count}`);
});

test('the same seed draws the same counts, every time', () => {
  assert.deepEqual(resolvedCounts('repeat'), resolvedCounts('repeat'));
  assert.notDeepEqual(resolvedCounts('one'), resolvedCounts('two'));
});

test('a fixed count is never treated as slack to trim', () => {
  // `logic: 4` is a statement about the test, not a range. Whatever the clock
  // demands, it must come out of the counts that were written as ranges.
  for (let i = 0; i < 40; i++) {
    const counts = resolvedCounts(`fixed-${i}`);
    assert.equal(counts.verbal!.logic, 10);
    assert.equal(counts.verbal!.sentence_completion, 6);
    assert.equal(counts.english!.restatement, 8);
  }
});

/* A real booklet with the page images stripped: same shape and same counts,
 * small enough to keep in the repo. The example bank is smaller than the plan,
 * and a sitting limited by an empty shelf would fit the clock however wildly
 * the ranges drew — which would make the test below prove nothing. */
const fullLength = JSON.parse(
  await readFile(new URL('./fixtures/full-length-bank.json', import.meta.url), 'utf8'),
);

test('no draw of the standard blueprint outruns the clock', () => {
  // Against a bank deep enough to fill the plan, and at every writing length
  // the sitting fits — this is what the trim exists to guarantee.
  for (const writingMinutes of [30, 35, 40]) {
    for (let i = 0; i < 120; i++) {
      const sitting = build.execute({
        bank: fullLength,
        blueprint: 'standard',
        seed: `clock-${i}`,
        writingMinutes,
      });
      assert.equal(
        sitting.summary.overBudget,
        false,
        `seed clock-${i} at ${writingMinutes}min ran ` +
          `${Math.round(sitting.summary.totalSeconds / 60)} minutes`,
      );
    }
  }
});

test('the sitting reports the counts it drew, so they can be recorded', () => {
  const sitting = build.execute({ bank, blueprint: 'standard', seed: 'reported' });
  const counts = sitting.resolvedBlueprint!;
  assert.ok(counts, 'a blueprinted sitting resolves its ranges');

  // What it says it drew has to be what it actually contains.
  const asked = { verbal: 0, quantitative: 0, english: 0 };
  for (const step of sitting.steps)
    if (step.kind === 'item' && step.scored) asked[step.domain as keyof typeof asked]++;

  const planned = (domain: 'verbal' | 'quantitative' | 'english') =>
    Object.entries(counts[domain]!)
      .filter(([key]) => key !== 'chapters' && key !== 'reading_passage' && key !== 'figure')
      .reduce((total, [, n]) => total + n, 0);

  // The example bank is smaller than the plan, so a sitting of it draws fewer.
  // What must hold is that it never draws *more* than it said, and that every
  // shortfall is reported rather than passed off as the intended length.
  for (const domain of ['verbal', 'quantitative', 'english'] as const)
    assert.ok(
      asked[domain] <= planned(domain),
      `${domain}: drew ${asked[domain]} against a plan of ${planned(domain)}`,
    );

  const short = (['verbal', 'quantitative', 'english'] as const).some(
    (domain) => asked[domain] < planned(domain),
  );
  assert.equal(short, sitting.summary.notes.length > 0, 'a shortfall must be said out loud');
});

/* Lifting the 5.5-hour ceiling. The trim exists to hold a sitting inside it;
 * someone practising without that constraint should be able to say so and get
 * the fuller draw, with the length reported rather than hidden. */
/** Deliberately more than the clock can hold, so the trim has something to do.
 *  `standard` fits inside the ceiling now, which is the point of it. */
const OVERSIZED = {
  verbal: { chapters: 2, analogy: [10, 20], sentence_completion: 6, logic: [10, 20],
    reading_passage: 1, reading_question: 5 },
  quantitative: { chapters: 2, problem: [27, 40], figure: 1, figure_question: 4 },
  english: { chapters: 2, sentence_completion: [12, 16], restatement: 8,
    reading_passage: 2, reading_question: 10 },
} as never;

test('an uncapped sitting draws more than a capped one', () => {
  const widest = (uncapped: boolean) => {
    let most = 0;
    for (let i = 0; i < 120; i++) {
      const sitting = build.execute({
        bank: fullLength,
        blueprint: OVERSIZED,
        seed: `cap-${i}`,
        uncapped,
      });
      most = Math.max(most, sitting.steps.filter((step) => step.kind === 'item').length);
    }
    return most;
  };

  assert.ok(widest(true) > widest(false), 'lifting the ceiling has to let more questions in');
});

test('an uncapped sitting still says how long it is', () => {
  // The flag lets the sitting run long; it does not make it pretend otherwise,
  // because the setup screen reads exactly this to tell the learner.
  let sawOne = false;
  for (let i = 0; i < 120; i++) {
    const sitting = build.execute({
      bank: fullLength,
      blueprint: OVERSIZED,
      seed: `honest-${i}`,
      uncapped: true,
    });
    const over = sitting.summary.totalSeconds > sitting.summary.maxSeconds;
    assert.equal(sitting.summary.overBudget, over, `seed honest-${i} misreports its length`);
    sawOne ||= over;
  }
  assert.ok(sawOne, 'if none of them ran long the assertion above proved nothing');
});

test('the ceiling flag is part of what makes a sitting reproducible', () => {
  // It changes the counts, so a resumed run rebuilt without it would be a
  // different paper — which is why it travels in the saved config.
  const of = (seed: string, uncapped: boolean) =>
    build.execute({ bank: fullLength, blueprint: OVERSIZED, seed, uncapped }).resolvedBlueprint;

  assert.deepEqual(of('same', true), of('same', true), 'same flag and seed, same draw');

  // Not every draw is large enough for the trim to bite, so the difference is
  // looked for across seeds rather than demanded of any one of them.
  const seeds = Array.from({ length: 60 }, (_, i) => `flag-${i}`);
  const differs = seeds.filter(
    (seed) => JSON.stringify(of(seed, true)) !== JSON.stringify(of(seed, false)),
  );
  assert.ok(differs.length, 'the flag has to change the draw somewhere, or it does nothing');
});

/* Sitting one domain, or two. The clock and the questions follow, and so does
 * the general score — which is weighted from all three and cannot be given for
 * a sitting that only measured one. */
test('a sitting can be limited to the domains chosen', () => {
  const counts = (domains: ('verbal' | 'quantitative' | 'english')[]) => {
    const sitting = build.execute({ bank: fullLength, blueprint: 'standard', seed: 'a', domains });
    const per: Record<string, number> = {};
    for (const step of sitting.steps)
      if (step.kind === 'item') per[step.domain] = (per[step.domain] ?? 0) + 1;
    return { per, seconds: sitting.summary.totalSeconds };
  };

  const only = counts(['quantitative']);
  assert.deepEqual(Object.keys(only.per), ['quantitative'], 'nothing else is asked');

  const two = counts(['verbal', 'english']);
  assert.deepEqual(Object.keys(two.per).sort(), ['english', 'verbal']);

  const all = counts(['verbal', 'quantitative', 'english']);
  assert.ok(only.seconds < all.seconds, 'a shorter sitting takes less of the clock');
  assert.equal(all.per['verbal'], two.per['verbal'], 'a domain is unchanged by its neighbours');
});

test('a partial sitting is not given a general score', async () => {
  const { renderResults } = await import('../src/presentation/web/views/results-view.ts');
  const sitting = build.execute({
    bank: fullLength,
    blueprint: 'standard',
    seed: 'a',
    domains: ['verbal'],
  });
  const responses: Responses = {};
  for (const step of sitting.steps)
    if (step.kind === 'item') responses[step.itemId] = step.answer;

  const { score } = new ScoreAttemptUseCase().execute({ sitting, responses });
  // Scored 150 on verbal, 50 on the two it never asked — a weighted number
  // built from those would read as a result rather than as a gap.
  assert.equal(score.uniform.verbal, 150);
  assert.equal(score.attempted.quantitative, 0);

  const html = renderResults({
    report: score,
    bank: fullLength,
    spent: {},
    essay: '',
    session: 'x',
    canSend: false,
  } as never);
  assert.ok(!html.includes(String(score.general.multi)), 'the general estimate is withheld');
  assert.match(html, /במושב חלקי הוא לא מחושב/);
});

test('a domain the booklet has none of is said out loud', () => {
  // A booklet with no English chapters. `selectGroups` counts shortfalls inside
  // a domain, so a missing one used to leave the sitting short and silent.
  const noEnglish = {
    ...fullLength,
    sections: fullLength.sections.filter((s: { domain: string }) => s.domain !== 'english'),
  };
  const sitting = build.execute({
    bank: noEnglish,
    blueprint: 'standard',
    seed: 'a',
    domains: ['verbal', 'quantitative', 'english'],
  });

  assert.ok(
    sitting.summary.notes.some((note) => note.includes('אנגלית')),
    `nothing said about the missing domain: ${JSON.stringify(sitting.summary.notes)}`,
  );
  assert.ok(!sitting.steps.some((s) => s.kind === 'item' && s.domain === 'english'));
});

test('each domain runs in two halves, with the passage or chart closing the second', () => {
  const sitting = build.execute({ bank: fullLength, blueprint: 'standard', seed: 'a' });

  const halves: { domain: string; types: string[] }[] = [];
  for (const step of sitting.steps) {
    if (step.kind === 'section-intro') halves.push({ domain: step.domain, types: [] });
    if ((step.kind === 'item' || step.kind === 'stimulus') && halves.length)
      halves.at(-1)!.types.push(step.kind === 'stimulus' ? '[stimulus]' : step.type);
  }

  assert.equal(halves.length, 6, 'three domains, two halves each');
  assert.ok(
    sitting.steps.some((s) => s.kind === 'break' && s.seconds === 150),
    'a 2:30 break falls between the halves',
  );

  const [v1, v2, q1, q2, e1, e2] = halves;
  assert.equal(v1!.types[0], 'analogy', 'verbal opens on analogies');
  assert.ok(!v1!.types.some((t) => t.startsWith('[')), 'no passage in the first half');
  assert.ok(v2!.types.includes('[stimulus]'), 'the passage is in the second half');
  assert.ok(v2!.types.at(-1)!.startsWith('reading'), 'and its questions close verbal');
  assert.ok(!q1!.types.some((t) => t.startsWith('[')), 'no chart in the first half');
  assert.ok(q2!.types.includes('[stimulus]'), 'the chart is in the second half');
  assert.ok(q2!.types.at(-1)!.startsWith('figure'), 'and its questions close quantitative');

  // English opens on sentence completion and restatement; the texts come after.
  assert.deepEqual([...new Set(e1!.types)], ['sentence_completion', 'restatement']);
  assert.ok(e2!.types.includes('restatement'), 'the rest of the restatements are in the second');
  assert.ok(e2!.types.at(-1)!.startsWith('reading'), 'and the texts close it');
});

test('the scoreboard reports a percentage per type and one overall', async () => {
  const { renderSummary } = await import('../src/presentation/web/views/summary-view.ts');
  const sitting = build.execute({ bank: fullLength, blueprint: 'standard', seed: 'a' });
  const responses: Responses = {};
  let n = 0;
  for (const step of sitting.steps)
    if (step.kind === 'item')
      responses[step.itemId] = n++ % 2 ? step.answer : (((step.answer % 4) + 1) as typeof step.answer);

  const { score } = new ScoreAttemptUseCase().execute({ sitting, responses });
  const html = renderSummary(score);

  assert.match(html, /ציון באחוזים/);
  assert.match(html, new RegExp(`ציון מספרי:.*${score.general.multi}`));
  // Roughly half right, so the overall percentage should say so.
  const overall = Number(/ציון באחוזים: <b>(\d+)%/.exec(html)?.[1]);
  assert.ok(overall > 35 && overall < 65, `overall reads ${overall}%`);
  assert.ok(html.includes('id="full"'), 'and the full debrief is one click on');
});
