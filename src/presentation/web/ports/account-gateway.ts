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

export interface AccountGateway {
  /** Null when the session has gone stale rather than when signed out. */
  me(): Promise<Identity | null>;
  banks(): Promise<StoredBank[]>;
  open(id: string): Promise<UnverifiedBank>;
  forget(id: string): Promise<void>;
}
