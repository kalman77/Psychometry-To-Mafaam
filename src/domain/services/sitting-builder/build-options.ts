/* The choices that shape a build. */

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
  rules?: RulebookOverrides;
}
