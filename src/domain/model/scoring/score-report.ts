/* What an attempt scored, domain by domain. */

import type { AnsweredItem } from './answered-item.ts';
import type { ByDomain } from './by-domain.ts';
import type { Composites } from './composites.ts';

export interface ScoreReport {
  /** Correct answers among scored items. */
  raw: ByDomain<number>;
  /** Scored items presented. */
  attempted: ByDomain<number>;
  /** 50–150 uniform scale. */
  uniform: ByDomain<number>;
  composites: Composites;
  /** 200–800 estimates, one per composite. */
  general: Composites;
  detail: AnsweredItem[];
}
