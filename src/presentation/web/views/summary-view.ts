/* The scoreboard shown before the full debrief: how much of each kind of
 * question came out right, and the grade on top.
 *
 * Built from `score.detail`, which already carries every question with its
 * domain, its type and whether it was right — so there is nothing to compute
 * that the report has not computed already. */

import type { Domain } from '../../../domain/model/bank.ts';
import type { ScoreReport } from '../../../domain/model/scoring.ts';
import { typeLabel } from '../../../domain/rules/labels.ts';
import { esc, when } from '../html.ts';

const DOMAINS: [Domain, string][] = [
  ['verbal', 'מילולי'],
  ['quantitative', 'כמותי'],
  ['english', 'אנגלית'],
];

const DOTS = 10;

const pct = (right: number, of: number): number => (of ? Math.round((right / of) * 100) : 0);

/** Ten dots, filled to the nearest tenth — the shape of a score read at a
 *  glance, next to the number that says it exactly. */
function dots(percent: number): string {
  const on = Math.round((percent / 100) * DOTS);
  return `<span class="dots" aria-hidden="true">${Array.from(
    { length: DOTS },
    (_, i) => `<i class="${i < on ? 'on' : ''}"></i>`,
  ).join('')}</span>`;
}

export function renderSummary(report: ScoreReport): string {
  const scored = report.detail.filter((item) => item.scored);
  const present = DOMAINS.filter(([domain]) => report.attempted[domain] > 0);
  const overall = pct(
    scored.filter((item) => item.correct).length,
    scored.length,
  );

  return `
  <div class="stage"><div class="sheet wide stagger" style="padding-block-start:min(7dvh,56px)">
    <header class="score-head">
      <p class="score-head-pct">ציון באחוזים: <b>${overall}%</b></p>
      ${when(
        present.length === DOMAINS.length,
        `<p class="score-head-num">ציון מספרי: <b>${report.general.multi}</b></p>`,
      )}
    </header>

    <div class="score-cards">
      ${present
        .map(([domain, label]) => {
          const mine = scored.filter((item) => item.domain === domain);
          const types = [...new Set(mine.map((item) => item.type))];
          return `
        <section class="card score-card">
          <div class="score-card-head">
            <h3>${esc(label)}</h3>
            <b>${pct(mine.filter((i) => i.correct).length, mine.length)}%</b>
          </div>
          ${types
            .map((type) => {
              const rows = mine.filter((item) => item.type === type);
              const percent = pct(rows.filter((i) => i.correct).length, rows.length);
              return `<div class="score-row">
              <span class="score-row-name">${esc(typeLabel(type))}</span>
              <span class="score-row-bar">${dots(percent)}<b>${percent}%</b></span>
            </div>`;
            })
            .join('')}
        </section>`;
        })
        .join('')}
    </div>

    <div class="controls"><button class="btn" id="full">לפירוט המלא</button></div>
  </div></div>`;
}
