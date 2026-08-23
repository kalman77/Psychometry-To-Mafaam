/* Does this bank hold up, and how big is it? */

import type { BankProblem } from '../../../domain/services/bank-validator/bank-problem.ts';

export interface ValidationReport {
  valid: boolean;
  problems: BankProblem[];
  /** Questions in the bank — 0 when it didn't validate. */
  itemCount: number;
}
