/* What a built sitting adds up to. */

import type { SittingDomain } from '../bank/sitting-domain.ts';
import type { DomainSummary } from './domain-summary.ts';

export interface SittingSummary {
  totalSeconds: number;
  breakSeconds: number;
  byDomain: Partial<Record<SittingDomain, DomainSummary>>;
  counts: { items: number; stimuli: number; breaks: number };
  /** The session ceiling this sitting was measured against. */
  maxSeconds: number;
  overBudget: boolean;
  /** "you asked for 8 analogies, the bank has 5" — never a silent shrink. */
  notes: string[];
}
