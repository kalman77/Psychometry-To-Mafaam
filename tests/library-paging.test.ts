/* The booklet shelf, a page at a time.
 *
 * Three to a page: more than that and the shelf pushes the length selector and
 * the start button off the bottom of the setup screen.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LIBRARY_PAGE_SIZE,
  clampLibraryPage,
  libraryPageCount,
  renderLibraryPage,
  renderSetup,
  type SetupViewModel,
} from '../src/presentation/web/views/setup-view.ts';
import type { StoredBank } from '../src/presentation/web/ports/stored-bank.ts';

const shelf = (n: number): StoredBank[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `bank-${i + 1}`,
    title: `חוברת ${i + 1}`,
    items: 130,
    bytes: 1_000_000,
    createdAt: 0,
  })) as StoredBank[];

const view = (banks: StoredBank[], libraryPage: number): string =>
  renderSetup({
    message: null,
    bank: null,
    problems: [],
    preview: null,
    config: {
      writingMinutes: 30,
      blueprint: 'standard',
      seed: 'a',
      includeWriting: true,
      domains: ['verbal', 'quantitative', 'english'],
      uncapped: false,
    },
    allowedMinutes: [30],
    saved: null,
    identity: null,
    library: banks,
    libraryPage,
  } as unknown as SetupViewModel);

const titlesOn = (html: string): string[] =>
  [...html.matchAll(/<b>(חוברת \d+)<\/b>/g)].map((m) => m[1]!);

test('a shelf that fits on one page has no pager', () => {
  const html = view(shelf(LIBRARY_PAGE_SIZE), 0);
  assert.equal(titlesOn(html).length, LIBRARY_PAGE_SIZE);
  assert.ok(!html.includes('lib-next'), 'nothing to page through');
});

test('a fourth booklet moves to a second page', () => {
  const html = view(shelf(4), 0);
  assert.deepEqual(titlesOn(html), ['חוברת 1', 'חוברת 2', 'חוברת 3']);
  assert.ok(html.includes('lib-next'), 'and there is a way to reach it');
  assert.match(html, /עמוד 1 מתוך 2/);

  assert.deepEqual(titlesOn(view(shelf(4), 1)), ['חוברת 4']);
});

test('the ends of the shelf are dead ends, not wrap-arounds', () => {
  const first = view(shelf(7), 0);
  assert.match(first, /id="lib-prev" disabled/);
  assert.ok(!/id="lib-next" disabled/.test(first));

  const last = view(shelf(7), 2);
  assert.match(last, /id="lib-next" disabled/);
  assert.ok(!/id="lib-prev" disabled/.test(last));
});

test('a page that no longer exists falls back to the last one', () => {
  // Deleting the only booklet on page 3 must not leave an empty shelf showing.
  assert.equal(clampLibraryPage(2, 7), 2);
  assert.equal(clampLibraryPage(2, 6), 1, 'seven became six, so page 3 is gone');
  assert.equal(clampLibraryPage(5, 1), 0);
  assert.equal(clampLibraryPage(-1, 9), 0, 'and there is no page before the first');

  assert.deepEqual(titlesOn(view(shelf(4), 9)), ['חוברת 4'], 'renders the last page, not none');
});

test('an empty shelf still has one page', () => {
  assert.equal(libraryPageCount(0), 1);
  assert.equal(clampLibraryPage(0, 0), 0);
});

test('every booklet appears on exactly one page', () => {
  const banks = shelf(8);
  const seen = new Set<string>();
  for (let page = 0; page < libraryPageCount(banks.length); page++)
    for (const title of titlesOn(view(banks, page))) {
      assert.ok(!seen.has(title), `${title} shows on two pages`);
      seen.add(title);
    }
  assert.equal(seen.size, banks.length, 'and none is lost between pages');
});

/* Turning a page repaints the whole setup screen. That is cheap — but it
 * destroys the button that was just pressed, and a keyboard user who lands on
 * `body` after every press cannot page through the shelf at all. */
test('the pager keeps the keyboard on a button it can still use', async (t) => {
  let jsdom: typeof import('jsdom');
  try {
    jsdom = await import('jsdom');
  } catch {
    return t.skip('jsdom not installed');
  }

  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../mapam-runner.html', import.meta.url), 'utf8');
  const dom = new jsdom.JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;
  t.after(() => window.close());
  const document = window.document as Document;

  // The shelf needs an account, which the standalone runner has not got, so the
  // markup is put on the page directly and only the focus rule is exercised.
  const root = document.querySelector('#app') ?? document.body;
  root.innerHTML = view(shelf(7), 0);

  const next = () => document.getElementById('lib-next') as HTMLButtonElement;
  next().focus();
  assert.equal(document.activeElement, next(), 'the button starts focused');

  // What a repaint does to it, and what the controller does about that.
  root.innerHTML = view(shelf(7), 2);
  assert.notEqual(document.activeElement, next(), 'a repaint drops focus to the body');

  const landing = next().disabled
    ? (document.getElementById('lib-prev') as HTMLButtonElement)
    : next();
  landing.focus();
  assert.equal(document.activeElement, landing);
  assert.equal(landing.disabled, false, 'and it lands somewhere still usable');
  assert.equal(landing.id, 'lib-prev', 'at the end of the shelf, that is the other button');
});

/* Turning a page must not repaint the screen around the shelf. A full repaint
 * costs little, but it replays the entrance animation and the whole page reads
 * as flashing on every press. */
test('turning a page replaces the shelf and nothing else', async (t) => {
  let jsdom: typeof import('jsdom');
  try {
    jsdom = await import('jsdom');
  } catch {
    return t.skip('jsdom not installed');
  }

  const dom = new jsdom.JSDOM('<div id="app"></div>', { pretendToBeVisual: true });
  const { window } = dom;
  t.after(() => window.close());
  const document = window.document as Document;

  const banks = shelf(7);
  document.getElementById('app')!.innerHTML = view(banks, 0);

  const outside = {
    drop: document.getElementById('drop'),
    demo: document.getElementById('demo'),
    card: document.querySelector('.library'),
  };
  const body = document.getElementById('library-body')!;
  assert.ok(outside.drop && outside.demo && outside.card, 'the screen renders around the shelf');

  // Exactly what the controller does on a page turn.
  body.innerHTML = renderLibraryPage(banks, 1);

  assert.deepEqual(
    [...document.querySelectorAll('.library-open b')].map((e) => e.textContent),
    ['חוברת 4', 'חוברת 5', 'חוברת 6'],
    'the shelf turned',
  );
  assert.equal(document.getElementById('drop'), outside.drop, 'the drop zone is untouched');
  assert.equal(document.getElementById('demo'), outside.demo, 'so is the example button');
  assert.equal(document.querySelector('.library'), outside.card, 'and the card around the shelf');
  assert.equal(document.getElementById('library-body'), body, 'the shelf element itself is reused');
});

/* A downloaded answers file, dropped back in. It carries its own marking, so
 * the results screen renders from it directly; the booklet is only needed for
 * the chapter grid and the pictures. */
test('a saved attempt renders as results, with or without its booklet', async () => {
  const { readFile } = await import('node:fs/promises');
  const { renderResults } = await import('../src/presentation/web/views/results-view.ts');

  const attempt = JSON.parse(
    await readFile(new URL('./fixtures/saved-attempt.json', import.meta.url), 'utf8'),
  );
  const bank = JSON.parse(
    await readFile(new URL('./fixtures/full-length-bank.json', import.meta.url), 'utf8'),
  );
  const view = (b: unknown) =>
    renderResults({
      report: attempt.score,
      bank: b,
      spent: attempt.spent,
      essay: attempt.essay,
      session: attempt.meta.session,
      canSend: false,
    } as never);

  // The scores come off the file itself, so they show either way.
  assert.match(view(null), /אומדן ציון כללי/);
  assert.ok(!view(null).includes('qgrid'), 'without the booklet there is no chapter grid');
  assert.ok(view(bank).includes('qgrid'), 'with it, the grid is back');
});

test('the brand ships inside the runner, not as a file it has to fetch', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../mapam-runner.html', import.meta.url), 'utf8');

  // The runner is one self-contained file, so an <img src> to disk would be a
  // broken image wherever it is opened from.
  assert.match(html, /<link rel="icon" type="image\/webp" href="data:image\/webp;base64,\w/);
  assert.match(html, /--logo:url\("data:image\/webp;base64,\w/);
  assert.ok(!/src="(app\/)?brand\//.test(html), 'nothing points at the brand folder');
});
