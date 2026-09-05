/* The busy overlay, driven through the controller's own ports.
 *
 * The runner is written against ports so it can run without a page, which is
 * what this uses: a fake Screen that keeps the last markup and hands back
 * elements from it. The interesting property is not that the overlay renders —
 * the smoke test covers that — but that it goes down however a job ends. A
 * spinner left up after a failure is a locked screen.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { BuildSittingUseCase } from '../src/application/use-cases/build-sitting.ts';
import { ScoreAttemptUseCase } from '../src/application/use-cases/score-attempt.ts';
import { RunnerController } from '../src/presentation/web/runner-controller.ts';
import { seededRandomFactory } from '../src/infrastructure/random/seeded-random.ts';
import type { LoadedBank } from '../src/presentation/web/ports/loaded-bank.ts';

/** Just enough of a Screen to hold markup and find things in it. */
class FakeScreen {
  html = '';
  private readonly elements = new Map<string, { dataset: Record<string, string>; textContent: string }>();

  render(html: string): void {
    this.html = html;
    // Re-create the elements the controller reaches for, the way a repaint
    // does — carrying the attributes the markup declares, so a fresh element
    // starts out as the browser would have built it.
    for (const id of ['busy', 'busy-label']) {
      const tag = new RegExp(`<[^>]*id="${id}"[^>]*>`).exec(html)?.[0];
      if (!tag) {
        this.elements.delete(id);
        continue;
      }
      const dataset: Record<string, string> = {};
      for (const [, name, value] of tag.matchAll(/data-([a-z-]+)="([^"]*)"/g)) dataset[name!] = value!;
      this.elements.set(id, { dataset, textContent: '' });
    }
  }
  byId(id: string): never | null {
    return (this.elements.get(id) ?? null) as never;
  }
  all(): never[] {
    return [];
  }
  onKey(): void {}
}

const stub = <T>(value: T) => value as never;

function makeController(read: (file: File) => Promise<LoadedBank>) {
  const screen = new FakeScreen();
  const controller = new RunnerController({
    screen: stub(screen),
    chrome: stub({ showTime() {}, showProgress() {} }),
    countdown: stub({ start() {}, stop() {}, remaining: () => 0, total: () => 0 }),
    bankFiles: stub({ read }),
    saver: stub({}),
    progress: stub({ load: () => null, save() {}, clear() {} }),
    buildSitting: new BuildSittingUseCase(seededRandomFactory),
    scoreAttempt: new ScoreAttemptUseCase(),
  });
  controller.start();
  return { controller, screen };
}

const overlay = (screen: FakeScreen) =>
  screen.byId('busy') as unknown as { dataset: Record<string, string> } | null;

test('the overlay is up while a booklet is being extracted', async () => {
  let release: ((loaded: LoadedBank) => void) | undefined;
  const { controller, screen } = makeController(
    () => new Promise<LoadedBank>((resolve) => (release = resolve)),
  );

  const loading = (controller as unknown as { loadFile(f: File): Promise<void> }).loadFile(
    {} as File,
  );
  // `loadFile` first checks whether the drop was a saved attempt rather than a
  // booklet, which is a microtask of its own before the overlay goes up.
  await Promise.resolve();
  assert.equal(overlay(screen)?.dataset['open'], 'true', 'up while the server works');
  assert.match(
    (screen.byId('busy-label') as unknown as { textContent: string }).textContent,
    /מחלץ/,
    'and it says what is happening',
  );

  release!({ bank: { sections: [] }, storedId: null } as unknown as LoadedBank);
  await loading;
  assert.equal(overlay(screen)?.dataset['open'], 'false', 'down once the booklet arrives');
});

/* The two above both repaint when the job ends, and a repaint rebuilds the
 * overlay hidden — so they cannot tell whether the job itself cleaned up.
 * This drives `working` on its own, where nothing repaints afterwards and the
 * only thing that can lower the overlay is the job's own finally. */
test('a job lowers the overlay itself, with no repaint to hide behind', async () => {
  const { controller, screen } = makeController(() => Promise.reject(new Error('unused')));
  const working = (controller as unknown as {
    working<T>(label: string, job: () => Promise<T>): Promise<T>;
  }).working.bind(controller);

  await working('עובד…', () => Promise.resolve('done'));
  assert.equal(overlay(screen)?.dataset['open'], 'false', 'down after a job that succeeds');

  await assert.rejects(working('נופל…', () => Promise.reject(new Error('boom'))), /boom/);
  assert.equal(
    overlay(screen)?.dataset['open'],
    'false',
    'and down after one that throws — a spinner left up is a locked screen',
  );
});

test('a failed extraction takes the overlay down with it', async () => {
  const { controller, screen } = makeController(() => Promise.reject(new Error('poppler died')));

  await (controller as unknown as { loadFile(f: File): Promise<void> }).loadFile({} as File);

  assert.equal(
    overlay(screen)?.dataset['open'],
    'false',
    'a failure must not leave the screen locked behind a spinner',
  );
  assert.match(screen.html, /poppler died/, 'and the error is what the user is told');
});
