/* What a built sitting adds up to: total clock, break clock, counts per domain. */

import type { SittingDomain } from '../model/bank.ts';
import type { DomainSummary, Step } from '../model/sitting.ts';
import type { SittingTotals } from './summary/sitting-totals.ts';

export type { SittingTotals } from './summary/sitting-totals.ts';

export function summarize(steps: Step[]): SittingTotals {
  const totals: SittingTotals = {
    totalSeconds: 0,
    breakSeconds: 0,
    byDomain: {},
    counts: { items: 0, stimuli: 0, breaks: 0 },
  };

  for (const step of steps) {
    const seconds = step.seconds ?? 0;
    totals.totalSeconds += seconds;

    if (step.kind === 'break') {
      totals.breakSeconds += seconds;
      totals.counts.breaks++;
      continue;
    }
    if (step.kind === 'item') totals.counts.items++;
    if (step.kind === 'stimulus') totals.counts.stimuli++;

    const domain = 'domain' in step ? (step.domain as SittingDomain) : undefined;
    if (!domain) continue;

    const entry: DomainSummary = totals.byDomain[domain] ?? { seconds: 0, items: 0 };
    entry.seconds += seconds;
    if (step.kind === 'item') entry.items++;
    totals.byDomain[domain] = entry;
  }

  return totals;
}
