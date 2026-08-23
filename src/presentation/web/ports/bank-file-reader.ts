/* Turning a dropped file into something the validator can look at. */

import type { UnverifiedBank } from '../../../domain/model/bank/unverified-bank.ts';

export interface BankFileReader {
  read(file: File): Promise<UnverifiedBank>;
}
