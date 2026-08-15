/* Use case: does this bank hold up, and how big is it? */

import type { Bank, UnverifiedBank } from '../../domain/model/bank.ts';
import {
  countItems,
  validateBank,
  type BankProblem,
} from '../../domain/services/bank-validator.ts';

export interface ValidationReport {
  valid: boolean;
  problems: BankProblem[];
  /** Questions in the bank — 0 when it didn't validate. */
  itemCount: number;
}

export class ValidateBankUseCase {
  execute(bank: UnverifiedBank): ValidationReport {
    const problems = validateBank(bank);
    return {
      valid: problems.length === 0,
      problems,
      itemCount: problems.length ? 0 : countItems(bank as Bank),
    };
  }
}
