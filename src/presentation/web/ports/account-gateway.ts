/* The signed-in account, when a server is serving this page.
 *
 * Absent in the standalone file:// runner, which has no account and no server —
 * the setup screen simply leaves out everything this would have supplied. */

import type { UnverifiedBank } from '../../../domain/model/bank/unverified-bank.ts';
import type { StoredBank } from './stored-bank.ts';

export interface Identity {
  name: string;
  email: string;
}

export interface FinishedAttempt {
  id: string;
  bankId: string | null;
  session: string;
  finishedAt: number;
  verbal: number;
  quantitative: number;
  english: number;
  multi: number;
  answered: number;
  correct: number;
  seconds: number;
}

export interface AccountGateway {
  /** Kept so the statistics page still has it once a booklet is deleted. */
  record(attempt: FinishedAttempt): Promise<void>;
  /** Null when the session has gone stale rather than when signed out. */
  me(): Promise<Identity | null>;
  banks(): Promise<StoredBank[]>;
  open(id: string): Promise<UnverifiedBank>;
  forget(id: string): Promise<void>;
}
