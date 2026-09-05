/* The version list, and the seed that is not on it.
 *
 * Turning a free text field into a select narrows what can be chosen, which is
 * the point — but a sitting already saved or filed under some other seed must
 * still rebuild as itself. Dropping it from the list would quietly rebuild a
 * different paper under the same name.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { VERSIONS, versionLabel } from '../src/domain/rules/labels.ts';
import { renderSetup } from '../src/presentation/web/views/setup-view.ts';
import type { SetupViewModel } from '../src/presentation/web/views/setup-view.ts';

const view = (seed: string): string =>
  renderSetup({
    message: null,
    bank: { meta: { title: 'x' }, sections: [] },
    problems: [],
    preview: {
      summary: {
        totalSeconds: 100,
        maxSeconds: 19800,
        breakSeconds: 0,
        overBudget: false,
        notes: [],
        byDomain: {},
        counts: { items: 1, stimuli: 0, breaks: 0 },
      },
    },
    config: { writingMinutes: 30, blueprint: 'standard', seed, includeWriting: true,
      domains: ['verbal', 'quantitative', 'english'], uncapped: false },
    allowedMinutes: [30],
    identity: null,
    library: [],
    saved: null,
  } as unknown as SetupViewModel);

/** The value of every <option> under the version select, in order. */
function offered(html: string): string[] {
  const select = /<select id="seed">([\s\S]*?)<\/select>/.exec(html)?.[1] ?? '';
  return [...select.matchAll(/value="([^"]*)"/g)].map((match) => match[1]!);
}

const selected = (html: string): string | undefined => {
  const select = /<select id="seed">([\s\S]*?)<\/select>/.exec(html)?.[1] ?? '';
  return /value="([^"]*)" selected/.exec(select)?.[1];
};

test('every named version is offered, and the current one is selected', () => {
  const html = view('c');
  assert.deepEqual(
    offered(html),
    VERSIONS.map((version) => version.seed),
  );
  assert.equal(selected(html), 'c');
  for (const version of VERSIONS) assert.ok(html.includes(version.label), version.label);
});

test('a seed that is not a named version is kept, not silently swapped', () => {
  // A run saved before the list existed, or one started from the command line
  // with --seed. Rebuilding it under 'a' would be a different paper.
  const html = view('my-own-seed');
  assert.ok(offered(html).includes('my-own-seed'), 'the seed in hand has to stay on offer');
  assert.equal(selected(html), 'my-own-seed', 'and stay selected');
  assert.equal(offered(html).length, VERSIONS.length + 1, 'added to the list, not replacing it');
});

test('a seed is escaped rather than trusted into the markup', () => {
  const html = view('"><script>x</script>');
  assert.ok(!html.includes('<script>x</script>'), 'a seed must not become markup');
});

test('versions are named, and the fallback names an unknown one', () => {
  assert.equal(versionLabel('a'), 'גרסה א׳');
  assert.equal(versionLabel('zzz'), 'גרסה zzz');
});

test('every version draws a distinct paper', async () => {
  const { BuildSittingUseCase } = await import('../src/application/use-cases/build-sitting.ts');
  const { seededRandomFactory } = await import('../src/infrastructure/random/seeded-random.ts');
  const { readFile } = await import('node:fs/promises');
  const bank = JSON.parse(
    await readFile(new URL('./fixtures/full-length-bank.json', import.meta.url), 'utf8'),
  );
  const build = new BuildSittingUseCase(seededRandomFactory);

  // Offering eight versions is only meaningful if they are eight papers.
  const papers = VERSIONS.map(({ seed }) =>
    build
      .execute({ bank, blueprint: 'standard', seed })
      .steps.filter((step) => step.kind === 'item')
      .map((step) => (step as { itemId: string }).itemId)
      .join(','),
  );
  assert.equal(new Set(papers).size, VERSIONS.length, 'two versions gave the same paper');
});
