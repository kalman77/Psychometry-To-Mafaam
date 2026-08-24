/* A file, read. */

import type { UnverifiedBank } from '../../../domain/model/bank/unverified-bank.ts';

export interface LoadedBank {
  bank: UnverifiedBank;
  /** The server-side id, when extraction stored it. Absent for a local JSON
   *  file and for the standalone runner, neither of which has anywhere to
   *  store one — which is exactly when a save cannot survive a reload. */
  storedId?: string;
}
