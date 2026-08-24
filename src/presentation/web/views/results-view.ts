/* The end of the sitting: scores, the essay, and every question with the time
 * actually spent on it. */

import type { Domain } from '../../../domain/model/bank.ts';
import { typeLabel } from '../../../domain/rules/labels.ts';
import { formatDuration } from '../../../domain/support/duration.ts';
import { esc, paragraphs, when } from '../html.ts';

const DOMAINS: [Domain, string][] = [
  ['verbal', 'חשיבה מילולית'],
  ['quantitative', 'חשיבה כמותית'],
  ['english', 'אנגלית'],
];

import type { ResultsViewModel } from './results-view/results-view-model.ts';

export type { ResultsViewModel } from './results-view/results-view-model.ts';

export function renderResults(vm: ResultsViewModel): string {
  const { report } = vm;
  const present = DOMAINS.filter(([domain]) => report.attempted[domain] > 0);

  return `
  <div class="stage"><div class="sheet narrow stagger" style="padding-block-start:min(8dvh,64px)">
    <header style="text-align:center">
      <p class="tag">סיימת</p>
      <h1 style="margin-block:12px 0">התוצאות</h1>
    </header>

    <div class="stats">
      ${present
        .map(
          ([domain, label]) => `
        <div class="stat"><div class="k">${label}</div>
          <div class="v">${report.uniform[domain]}<small> · ${report.raw[domain]} מתוך ${report.attempted[domain]}</small></div></div>`,
        )
        .join('')}
    </div>

    <div class="card">
      <h3>אומדן ציון כללי</h3>
      <div class="stats" style="margin-block-start:16px">
        <div class="stat" style="box-shadow:none;background:var(--sage-050)"><div class="k">רב־תחומי</div><div class="v">${report.general.multi}</div></div>
        <div class="stat" style="box-shadow:none;background:var(--sage-050)"><div class="k">דגש מילולי</div><div class="v">${report.general.verbalEmphasis}</div></div>
        <div class="stat" style="box-shadow:none;background:var(--sage-050)"><div class="k">דגש כמותי</div><div class="v">${report.general.quantEmphasis}</div></div>
      </div>
      <p class="instruction" style="margin:16px 0 0">בסולם 200–800, לפי טבלאות ההמרה של המועד הזה. האומדן מניח מבחן מלא ואינו כולל את מטלת הכתיבה.</p>
    </div>

    ${when(
      vm.essay.trim(),
      `<div class="card"><h3>החיבור שלך</h3><div class="passage" style="max-height:32dvh">${paragraphs(vm.essay)}</div></div>`,
    )}

    <div>
      <p class="tag" style="margin-block-end:12px">שאלה אחר שאלה</p>
      <table class="review">
        <thead><tr><th>שאלה</th><th>סוג</th><th>תשובתך</th><th>נכונה</th><th>זמן</th></tr></thead>
        <tbody>${report.detail
          .map(
            (d) => `
          <tr>
            <td class="n"><span class="dot ${d.given == null ? 'na' : d.correct ? 'ok' : 'no'}"></span>${esc(d.itemId)}</td>
            <td>${esc(typeLabel(d.type))}</td>
            <td class="n">${d.given == null ? '—' : d.given}</td>
            <td class="n">${d.answer}</td>
            <td class="n">${formatDuration(vm.spent[d.itemId] ?? 0)}</td>
          </tr>`,
          )
          .join('')}</tbody>
      </table>
    </div>

    <div class="controls">
      <button class="btn" id="again">להריץ שוב</button>
      <button class="btn quiet" id="dl">להוריד את התשובות</button>
      ${when(vm.essay.trim(), `<button class="btn quiet" id="dl-essay">להוריד את החיבור (Word)</button>`)}
      ${when(vm.essay.trim() && vm.canSend, `<button class="btn quiet" id="send-essay">לשלוח לבדיקה</button>`)}
    </div>
    <p class="tag" id="send-note" style="text-align:center;margin:14px 0 0"></p>
    <div style="display:none">
    </div>
  </div></div>`;
}
