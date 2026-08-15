/* Where a bank comes from. The file system, a drop zone, a fetch — the use
 * cases neither know nor care. */

import type { UnverifiedBank } from '../../domain/model/bank.ts';

export interface BankRepository {
  /** `reference` is adapter-specific: a path, a URL, a key. */
  load(reference: string): Promise<UnverifiedBank>;
}
