/* The choices that shape a build. */

import type { Domain } from '../../model/bank/domain.ts';
import type { Blueprint } from '../../rules/blueprints/blueprint.ts';
import type { RulebookOverrides } from '../../rules/rulebook/rulebook-overrides.ts';

export interface BuildOptions {
  /** null (the default) takes the bank as-is; otherwise a resolved blueprint. */
  blueprint?: Blueprint | null;
  /** Recorded on the sitting so a run can be reproduced. */
  seed?: string | null;
  includeWriting?: boolean;
  writingMinutes?: number;
  /** Chapters per domain when no blueprint dictates it. */
  chapters?: number;
  /** Seconds on each section-intro screen. */
  introSeconds?: number;
  /** Which domains to sit. Omitted, every domain the bank has. */
  domains?: Domain[];
  /** Let the sitting run past `session.maxSeconds`.
   *
   *  The ceiling normally trims a blueprint's ranges back down to fit. Lifting
   *  it lets the full published counts stand, which is what someone practising
   *  without a five-and-a-half-hour constraint wants. The sitting still reports
   *  itself as over — `summary.overBudget` stays truthful, and the screen says
   *  so as a fact rather than a warning. */
  uncapped?: boolean;
  rules?: RulebookOverrides;
}
