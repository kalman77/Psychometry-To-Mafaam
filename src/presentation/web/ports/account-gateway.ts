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

/* What a finished sitting reports: which booklet, how it was set up, and what
 * was answered — deliberately not what any of it scored.
 *
 * The server rebuilds the sitting from the same bank, blueprint and seed and
 * marks these responses itself. Sending scores would mean the dashboard a
 * teacher reads was assembled from numbers the browser chose. */
export interface FinishedAttempt {
  bankId: string;
  blueprint: string | null;
  seed: string | null;
  writingMinutes: number;
  includeWriting: boolean;
  /** Whether the 5.5-hour ceiling was lifted. It decides how many questions the
   *  blueprint's ranges resolved to, so the server cannot rebuild this sitting
   *  without it. */
  uncapped: boolean;
  /** Which domains were sat — the server rebuilds the same subset to mark it. */
  domains: string[];
  responses: Record<string, number | null | undefined>;
  spent: Record<string, number>;
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
