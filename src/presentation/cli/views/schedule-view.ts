/* Renders a built sitting as the schedule table the CLI prints:
 * one line per step, then the totals and whether it fits the ceiling. */

import type { Sitting, Step } from '../../../domain/model/sitting.ts';
import { domainLabel, typeLabel } from '../../../domain/rules/labels.ts';
import { formatDuration, minutesOf } from '../../../domain/support/duration.ts';

const RULE = '-'.repeat(78);

function pad(value: string | number, width: number): string {
  const text = String(value);
  return text + ' '.repeat(Math.max(1, width - text.length));
}

function describe(step: Step): string {
  switch (step.kind) {
    case 'item':
      return `${step.itemId}  (${typeLabel(step.type)})`;
    case 'stimulus':
    case 'section-intro':
      return step.title;
    case 'writing':
      return 'מטלת כתיבה';
    case 'break':
      return `הפסקה (${step.after})`;
    default:
      return '';
  }
}

export function renderSchedule(sitting: Sitting): string {
  const lines: string[] = [
    pad('#', 4) + pad('at', 8) + pad('len', 7) + pad('kind', 15) + 'what',
    RULE,
  ];

  let elapsed = 0;
  for (const step of sitting.steps) {
    if (step.kind === 'end') continue;
    lines.push(
      pad(step.index, 4) +
        pad(formatDuration(elapsed), 8) +
        pad(step.seconds ? formatDuration(step.seconds) : '—', 7) +
        pad(step.kind, 15) +
        describe(step),
    );
    elapsed += step.seconds ?? 0;
  }
  lines.push(RULE);

  const s = sitting.summary;
  lines.push(
    `סה״כ ${formatDuration(s.totalSeconds)}  (${minutesOf(s.totalSeconds)} דק׳), מתוכן ` +
      `${minutesOf(s.breakSeconds)} דק׳ הפסקות · ${s.counts.items} שאלות`,
  );

  for (const [domain, totals] of Object.entries(s.byDomain)) {
    if (!totals) continue;
    lines.push(
      '  ' +
        pad(domainLabel(domain), 16) +
        pad(`${totals.items} שאלות`, 12) +
        formatDuration(totals.seconds),
    );
  }

  lines.push(
    `${s.overBudget ? '✗ חורג' : '✓ בתוך'} תקרת ${minutesOf(s.maxSeconds)} דק׳ למושב.`,
  );
  for (const note of s.notes) lines.push(`  ! ${note}`);

  return lines.join('\n');
}
