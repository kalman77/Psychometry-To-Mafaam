/** Partial overrides an institution can hand to a build. */

import type { Rulebook } from './rulebook.ts';

export type RulebookOverrides = {
  [K in keyof Rulebook]?: Rulebook[K] extends object ? Partial<Rulebook[K]> : Rulebook[K];
};
