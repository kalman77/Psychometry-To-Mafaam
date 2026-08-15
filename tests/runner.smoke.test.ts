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
  for (let guard = 0; guard < 400; guard++) {
    if (document.getElementById('again')) break; // results screen

    if (document.querySelector('.opt')) {
      seen.add('item');
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

  assert.deepEqual([...seen].sort(), ['break', 'intro', 'item', 'stimulus']);

  // -- results ------------------------------------------------------------
  const text = document.body.textContent ?? '';
  assert.match(text, /התוצאות/);
  assert.match(text, /אומדן ציון כללי/);
  assert.ok(document.querySelector('table.review tbody tr'), 'per-question review renders');
  assert.match(text, /החיבור שלך/, 'the essay is kept');
  assert.equal((document.querySelector('#rail i') as HTMLElement).style.width, '100%');

  click(document, 'dl'); // downloads the attempt without throwing
  click(document, 'again');
  assert.ok(document.getElementById('drop'), 'running again returns to setup');

  window.close();
});
