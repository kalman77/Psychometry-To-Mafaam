/* Everything the runner reaches for, injected so nothing here needs a page. */

import type { BuildSittingUseCase } from '../../../application/use-cases/build-sitting.ts';
import type { ScoreAttemptUseCase } from '../../../application/use-cases/score-attempt.ts';
import type { UnverifiedBank } from '../../../domain/model/bank/unverified-bank.ts';
import type { BankFileReader } from '../ports/bank-file-reader.ts';
import type { Chrome } from '../ports/chrome.ts';
import type { Countdown } from '../ports/countdown.ts';
import type { FileSaver } from '../ports/file-saver.ts';
import type { AccountGateway } from '../ports/account-gateway.ts';
import type { EssayMailer } from '../ports/essay-mailer.ts';
import type { ProgressStore } from '../ports/progress-store.ts';
import type { Screen } from '../ports/screen.ts';

export interface RunnerDeps {
  screen: Screen;
  chrome: Chrome;
  countdown: Countdown;
  bankFiles: BankFileReader;
  saver: FileSaver;
  progress: ProgressStore;
  /** Absent in the standalone runner, which has no server behind it. */
  account?: AccountGateway | null;
  postEssay?: EssayMailer | null;
  buildSitting: BuildSittingUseCase;
  scoreAttempt: ScoreAttemptUseCase;
  /** Bank inlined at build time, offered as "start from the example". */
  exampleBank?: UnverifiedBank | null;
}
