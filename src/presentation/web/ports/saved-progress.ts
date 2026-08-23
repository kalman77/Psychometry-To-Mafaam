/* A sitting caught mid-flight.
 *
 * The bank is not in here. A sitting is a pure function of bank, blueprint and
 * seed — that is what makes `--seed a` reproducible — so replaying those three
 * rebuilds the identical step list, and progress is only where the learner got
 * to inside it. That keeps a save a few KB instead of the bank's several MB. */

import type { Responses } from '../../../domain/model/scoring/responses.ts';
import type { TimeSpent } from '../../../domain/model/scoring/time-spent.ts';
import type { SetupConfig } from '../views/setup-view/setup-config.ts';

export interface SavedProgress {
  /** Identifies the bank this run belongs to; a save is refused onto another. */
  fingerprint: string;
  /** Milliseconds since the epoch, for "saved 4 minutes ago". */
  savedAt: number;
  /** Replayed through the builder to get the same steps back. */
  config: SetupConfig;
  /** Index into `sitting.steps`. */
  cursor: number;
  /** Seconds left on the step it stopped on — a timed exam should not hand
   *  back a fresh clock for a question already half spent. */
  remaining: number;
  responses: Responses;
  spent: TimeSpent;
  essay: string;
}
