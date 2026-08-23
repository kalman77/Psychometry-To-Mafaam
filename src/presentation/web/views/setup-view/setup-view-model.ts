/* Everything the opening screen paints. */

import type { Bank } from '../../../../domain/model/bank/bank.ts';
import type { Sitting } from '../../../../domain/model/sitting/sitting.ts';
import type { BankProblem } from '../../../../domain/services/bank-validator/bank-problem.ts';
import type { SavedProgress } from '../../ports/saved-progress.ts';
import type { SetupConfig } from './setup-config.ts';

export interface SetupViewModel {
  message: string | null;
  bank: Bank | null;
  problems: BankProblem[];
  /** Built from the current config, so the numbers on screen are the real ones. */
  preview: Sitting | null;
  config: SetupConfig;
  allowedMinutes: number[];
  /** A run of this same bank that was interrupted, offered back. */
  saved: SavedProgress | null;
}
