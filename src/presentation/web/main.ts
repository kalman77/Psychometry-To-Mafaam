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
import { IntervalCountdown } from '../../infrastructure/web/interval-countdown.ts';
import { JsonFileSaver } from '../../infrastructure/web/json-file-saver.ts';
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
  const controller = new RunnerController({
    screen: new DomScreen(required<HTMLElement>('#app')),
    chrome: new DomChrome(
      required<HTMLElement>('#dial'),
      required<SVGCircleElement>('#arc'),
      required<HTMLElement>('#clock'),
      required<HTMLElement>('#rail i'),
    ),
    countdown: new IntervalCountdown(),
    bankFiles: new BrowserBankFileReader(),
    saver: new JsonFileSaver(),
    buildSitting: new BuildSittingUseCase(seededRandomFactory),
    scoreAttempt: new ScoreAttemptUseCase(),
    exampleBank: window.EXAMPLE_BANK ?? null,
  });

  // Leaving mid-sitting loses the run — there is no going back in this format.
  window.addEventListener('beforeunload', (event) => {
    if (!controller.isRunning()) return;
    event.preventDefault();
    event.returnValue = '';
  });

  controller.start();
  return controller;
}

bootstrap();
