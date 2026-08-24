/* Turning a dropped file into something the validator can look at. */

import type { LoadedBank } from './loaded-bank.ts';

export interface BankFileReader {
  read(file: File): Promise<LoadedBank>;
}
