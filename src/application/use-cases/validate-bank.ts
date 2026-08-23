/* Use case: does this bank hold up, and how big is it? */

import type { Bank, UnverifiedBank } from '../../domain/model/bank.ts';
import { countItems, validateBank } from '../../domain/services/bank-validator.ts';
import type { ValidationReport } from './validate-bank/validation-report.ts';

export type { ValidationReport } from './validate-bank/validation-report.ts';

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
