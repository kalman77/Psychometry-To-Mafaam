import type { BankProblem } from './services/bank-validator.ts';

/** Thrown when a build is attempted on a bank the validator rejected. */
export class InvalidBankError extends Error {
  readonly problems: BankProblem[];

  constructor(problems: BankProblem[]) {
    super(`הבנק אינו תקין (${problems.length} בעיות).`);
    this.name = 'InvalidBankError';
    this.problems = problems;
  }
}
