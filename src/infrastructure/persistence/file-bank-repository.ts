/* Node adapter: a bank read off disk. */

import { readFile } from 'node:fs/promises';
import type { BankRepository } from '../../application/ports/bank-repository.ts';
import type { UnverifiedBank } from '../../domain/model/bank.ts';

export class BankFileError extends Error {
  constructor(path: string, cause: unknown) {
    super(`לא ניתן לקרוא את הבנק ${path}: ${(cause as Error).message}`);
    this.name = 'BankFileError';
  }
}

export class FileBankRepository implements BankRepository {
  async load(path: string): Promise<UnverifiedBank> {
    try {
      return JSON.parse(await readFile(path, 'utf8')) as UnverifiedBank;
    } catch (error) {
      throw new BankFileError(path, error);
    }
  }
}
