/* Web composition root: find the page's furniture, build the adapters, hand
 * them to the controller, start it. The only file in the runner that knows
 * both the browser and the use cases exist. */

import { BuildSittingUseCase } from '../../application/use-cases/build-sitting.ts';
import { ScoreAttemptUseCase } from '../../application/use-cases/score-attempt.ts';
import type { UnverifiedBank } from '../../domain/model/bank.ts';
import { seededRandomFactory } from '../../infrastructure/random/seeded-random.ts';
import { DomChrome } from '../../infrastructure/web/dom-chrome.ts';
import { DomScreen } from '../../infrastructure/web/dom-screen.ts';
import { BrowserBankFileReader } from '../../infrastructure/web/file-bank-reader.ts';
import { ServerAccount } from '../../infrastructure/web/server-account.ts';
import { ServerBankFileReader } from '../../infrastructure/web/server-bank-file-reader.ts';
import { IntervalCountdown } from '../../infrastructure/web/interval-countdown.ts';
import { JsonFileSaver } from '../../infrastructure/web/json-file-saver.ts';
import { LocalProgressStore } from '../../infrastructure/web/local-progress-store.ts';
import { RemoteProgressStore } from '../../infrastructure/web/remote-progress-store.ts';
import { ServerEssayMailer } from '../../infrastructure/web/server-essay-mailer.ts';
import { RunnerController } from './runner-controller.ts';

declare global {
  interface Window {
    /** Inlined by scripts/build-runner.mjs, absent in a bare template. */
    EXAMPLE_BANK?: UnverifiedBank;
  }
}

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`הרצה נכשלה: חסר האלמנט ${selector}`);
  return element;
}

export function bootstrap(): RunnerController {
  // Opened from a file:// URL there is no server to ask: no account, no stored
  // progress and no PDF extraction, so all of it stays out of the way. The
  // fetch check is not belt-and-braces — a page can be served somewhere fetch
  // does not exist, and the runner still has to work there.
  const served = location.protocol !== 'file:' && typeof fetch === 'function';

  const controller = new RunnerController({
    screen: new DomScreen(required<HTMLElement>('#app')),
    chrome: new DomChrome(
      required<HTMLElement>('#dial'),
      required<SVGCircleElement>('#arc'),
      required<HTMLElement>('#clock'),
      required<HTMLElement>('#rail i'),
    ),
    countdown: new IntervalCountdown(),
    // Opened from a file:// URL there is no server to ask, so PDFs are only
    // offered when one served this page.
    bankFiles: served ? new ServerBankFileReader() : new BrowserBankFileReader(),
    account: served ? new ServerAccount() : null,
    postEssay: served ? new ServerEssayMailer() : null,
    saver: new JsonFileSaver(),
    progress: served ? new RemoteProgressStore() : new LocalProgressStore(),
    buildSitting: new BuildSittingUseCase(seededRandomFactory),
    scoreAttempt: new ScoreAttemptUseCase(),
    exampleBank: window.EXAMPLE_BANK ?? null,
  });

  // Progress is saved as the sitting moves, so leaving costs the current
  // question rather than the whole run — but it is still worth a confirmation.
  window.addEventListener('beforeunload', (event) => {
    if (!controller.isRunning()) return;
    event.preventDefault();
    event.returnValue = '';
  });

  controller.start();
  return controller;
}

bootstrap();
