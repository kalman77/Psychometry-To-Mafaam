/* The measurable half of a sitting summary — no budget verdict, no notes. */

import type { SittingSummary } from '../../model/sitting/sitting-summary.ts';

export type SittingTotals = Omit<SittingSummary, 'maxSeconds' | 'overBudget' | 'notes'>;
