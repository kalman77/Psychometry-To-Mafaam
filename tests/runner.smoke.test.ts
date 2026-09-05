/* Walks the built runner through a whole sitting in jsdom: every screen type,
 * the keyboard, the clock, and the score at the end.
 *
 *   npm i jsdom && npm test
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const HTML_PATH = new URL('../mapam-runner.html', import.meta.url);

async function openRunner() {
  let jsdom: typeof import('jsdom');
  try {
    jsdom = await import('jsdom');
  } catch {
    return null; // jsdom is optional — the rest of the suite still runs.
  }

  const html = await readFile(HTML_PATH, 'utf8');
  const dom = new jsdom.JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://mapam.test/',
  });
  const { window } = dom;
  window.URL.createObjectURL = () => 'blob:stub';
  window.URL.revokeObjectURL = () => {};
  return { dom, window, document: window.document as Document };
}

/** Click by id, or fail loudly with what the screen actually offered. */
function click(document: Document, id: string): void {
  const button = document.getElementById(id);
  assert.ok(button, `expected #${id} on screen, saw: ${visibleIds(document)}`);
  button.dispatchEvent(new (document.defaultView as any).MouseEvent('click', { bubbles: true }));
}

function visibleIds(document: Document): string {
  return [...document.querySelectorAll('[id]')].map((el) => el.id).join(', ');
}

function press(document: Document, key: string, init: KeyboardEventInit = {}): void {
  const view = document.defaultView as any;
  document.dispatchEvent(new view.KeyboardEvent('keydown', { key, bubbles: true, ...init }));
}

test('the built runner walks a whole sitting', async (t) => {
  const opened = await openRunner();
  if (!opened) return t.skip('jsdom not installed');
  const { window, document } = opened;

  // -- setup screen -------------------------------------------------------
  assert.ok(document.getElementById('drop'), 'drop zone renders');
  click(document, 'demo');
  assert.ok(document.getElementById('start'), 'the example bank is embedded and previews');
  assert.match(document.body.textContent ?? '', /שאלות/);

  // The length selector must survive a re-render — it used to reset itself.
  const bp = document.getElementById('bp') as HTMLSelectElement;
  bp.value = 'half';
  bp.dispatchEvent(new (window as any).Event('change'));
  assert.equal((document.getElementById('bp') as HTMLSelectElement).value, 'half');

  const seed = document.getElementById('seed') as HTMLInputElement;
  assert.equal(seed.value, 'a');

  click(document, 'start');

  // -- writing task -------------------------------------------------------
  const essay = document.getElementById('essay') as HTMLTextAreaElement;
  assert.ok(essay, 'the writing task comes first');
  essay.value = 'שורה ראשונה\nשורה שנייה';
  essay.dispatchEvent(new (window as any).Event('input'));
  assert.equal(document.getElementById('words')?.textContent, '4');
  press(document, 'Enter', { ctrlKey: true });

  // -- the rest of the sitting -------------------------------------------
  const seen = new Set<string>();
  let questionChrome = '';
  for (let guard = 0; guard < 400; guard++) {
    if (document.getElementById('again')) break; // results screen
    // The scoreboard comes first now; the full debrief is one click behind it.
    if (document.getElementById('full')) {
      seen.add('summary');
      click(document, 'full');
      continue;
    }

    if (document.querySelector('.opt')) {
      seen.add('item');
      questionChrome += ' ' + (document.querySelector('.topbar')?.textContent ?? '');
      press(document, '2');
      assert.equal(
        document.querySelector('.opt[data-i="2"]')?.getAttribute('aria-checked'),
        'true',
        'the chosen answer is marked',
      );
      press(document, 'Enter');
      continue;
    }
    if (document.getElementById('bigclock')) {
      seen.add('break');
      click(document, 'go'); // breaks can be cut short
      continue;
    }
    if (document.getElementById('go')) {
      seen.add(document.querySelector('.passage') ? 'stimulus' : 'intro');
      press(document, 'Enter');
      continue;
    }
    assert.fail(`stuck on a screen with no controls: ${visibleIds(document)}`);
  }

  assert.deepEqual([...seen].sort(), ['break', 'intro', 'item', 'stimulus', 'summary']);

  // Nothing on a question screen counts it. A sitting draws out of the
  // booklet's order, so a number there is one more thing to read and nothing
  // to act on — the rail shows how far along it is instead.
  assert.ok(!/\d+\s*מתוך\s*\d+/.test(questionChrome), 'no question counter during the exam');

  // -- results ------------------------------------------------------------
  const text = document.body.textContent ?? '';
  assert.match(text, /התוצאות/);
  assert.match(text, /אומדן ציון כללי/);
  const cells = [...document.querySelectorAll('.qcell')] as HTMLElement[];
  assert.ok(cells.length, 'the review grid renders');
  assert.ok(
    document.querySelectorAll('.chapter').length >= 2,
    'the booklet chapters are shown apart',
  );

  const panel = document.getElementById('qdetail') as HTMLElement;
  assert.match(panel.textContent ?? '', /בחרו שאלה/, 'the panel says what it is for');

  // Every question opens, including one the sitting never drew.
  const asked = cells.find((cell) => cell.querySelector('.mark.correct, .mark.wrong'));
  const unasked = cells.find((cell) => cell.querySelector('.mark.not-asked'));
  assert.ok(asked, 'at least one question was asked');

  asked.dispatchEvent(new (window as any).MouseEvent('click', { bubbles: true }));
  assert.match(panel.textContent ?? '', /שאלה \d+/, 'clicking a question opens it');
  assert.ok(panel.querySelector('.review-opt.right'), 'the correct answer is marked');

  if (unasked) {
    unasked.dispatchEvent(new (window as any).MouseEvent('click', { bubbles: true }));
    assert.match(panel.textContent ?? '', /לא נכללה במבחן/, 'an unasked question opens too');
  }

  click(document, 'qdetail-close');
  assert.match(panel.textContent ?? '', /בחרו שאלה/, 'and closing returns the prompt');
  assert.match(text, /החיבור שלך/, 'the essay is kept');
  assert.equal((document.querySelector('#rail i') as HTMLElement).style.width, '100%');

  click(document, 'dl'); // downloads the attempt without throwing
  click(document, 'again');
  assert.ok(document.getElementById('drop'), 'running again returns to setup');

  window.close();
});

/* The overlay has to be on every screen, not just the first, because a repaint
 * during a slow job would otherwise wipe it — which is the exact moment it is
 * meant to be up. */
test('the busy overlay is painted with every screen and starts hidden', async (t) => {
  const opened = await openRunner();
  if (!opened) return t.skip('jsdom not installed');
  const { window, document } = opened;
  // Starting the sitting starts its clock; without this the timers keep the
  // test runner alive after the assertions have all passed.
  t.after(() => window.close());

  const overlay = (): HTMLElement | null => document.getElementById('busy');
  assert.ok(overlay(), 'the setup screen carries the overlay');
  assert.equal(overlay()!.dataset['open'], 'false', 'and it is out of the way');
  assert.ok(document.getElementById('busy-label'), 'with somewhere to say what is happening');

  // Repaint by loading the demo bank, then again by starting the sitting.
  click(document, 'demo');
  assert.ok(overlay(), 'still there after the bank loads');
  assert.equal(overlay()!.dataset['open'], 'false');

  click(document, 'start');
  assert.ok(overlay(), 'still there once the sitting is under way');
  assert.equal(overlay()!.dataset['open'], 'false');
});


/* The ceiling toggle has to survive the re-render it triggers — the length
 * selector had this exact bug once, and a checkbox that unticks itself is
 * worse than no checkbox. */
test('the long-sitting toggle stays put once ticked', async (t) => {
  const opened = await openRunner();
  if (!opened) return t.skip('jsdom not installed');
  const { window, document } = opened;
  t.after(() => window.close());

  click(document, 'demo');
  const box = () => document.getElementById('uncapped') as HTMLInputElement | null;
  assert.ok(box(), 'the setup screen offers it');
  assert.equal(box()!.checked, false, 'and starts off');

  const before = box()!;
  before.checked = true;
  before.dispatchEvent(new (window as any).Event('change', { bubbles: true }));

  // Ticking it re-renders the setup screen, which replaces the node. Comparing
  // identity is what tells a working binding from a checkbox wired to nothing:
  // simply reading `.checked` back would pass either way, since this test set
  // it in the first place.
  assert.notEqual(box(), before, 'the toggle has to reach the controller');
  assert.ok(document.getElementById('start'), 'the setup screen is still usable');
  assert.equal(box()!.checked, true, 'and the choice survived the re-render');
});

test('the version picker offers the named versions and switches between them', async (t) => {
  const opened = await openRunner();
  if (!opened) return t.skip('jsdom not installed');
  const { window, document } = opened;
  t.after(() => window.close());

  click(document, 'demo');
  const picker = () => document.getElementById('seed') as HTMLSelectElement | null;
  assert.equal(picker()?.tagName, 'SELECT', 'a version is chosen, not typed');
  assert.ok(picker()!.options.length >= 2, 'with something to choose between');
  assert.equal(picker()!.value, 'a', 'starting on the first');

  const before = picker()!;
  before.value = 'd';
  before.dispatchEvent(new (window as any).Event('change', { bubbles: true }));

  // As with the ceiling toggle: identity, because reading the value back would
  // pass whether or not the picker is wired to anything.
  assert.notEqual(picker(), before, 'choosing a version has to reach the controller');
  assert.equal(picker()!.value, 'd', 'and the choice sticks');
});
