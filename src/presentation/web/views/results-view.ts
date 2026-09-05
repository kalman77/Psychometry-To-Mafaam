/* The end of the sitting: scores, the essay, and every question with the time
 * actually spent on it. */

import type { Domain } from '../../../domain/model/bank.ts';
import { esc, paragraphs, when } from '../html.ts';
import { renderNotice, SENDING_NOT_READY } from './notice.ts';
import { reviewChapters, type ReviewedChapter, type ReviewedDomain } from './results-view/chapter-review.ts';

const DOMAINS: [Domain, string][] = [
  ['verbal', 'חשיבה מילולית'],
  ['quantitative', 'חשיבה כמותית'],
  ['english', 'אנגלית'],
];

import type { ResultsViewModel } from './results-view/results-view-model.ts';

export type { ResultsViewModel } from './results-view/results-view-model.ts';

const STATUS_LEGEND: [string, string][] = [
  ['correct', 'תשובה נכונה'],
  ['wrong', 'תשובה שגויה'],
  ['blank', 'לא נענתה'],
  ['not-asked', 'שאלה שלא נכללה במבחן'],
];

/** The booklet's chapters as a wall of marks, each one a way into the question.
 *
 *  Every question of the printed chapter is here, not only the ones this
 *  sitting drew — the numbers are the booklet's own, so a mark can be found on
 *  the page it came from. */
function renderChapters(vm: ResultsViewModel): string {
  const domains = reviewChapters(vm.bank, vm.report.detail);
  if (!domains.length) return '';

  return `
    <div>
      <p class="tag" style="margin-block-end:12px">שאלה אחר שאלה</p>
      <div class="legend">
        ${STATUS_LEGEND.map(
          ([status, label]) =>
            `<span class="legend-item"><span class="mark ${status}"></span>${esc(label)}</span>`,
        ).join('')}
      </div>
      <div class="review-layout">
        <div class="review-grids">${domains.map(renderDomainChapters).join('')}</div>
        <div class="review-detail">
          <div class="card qdetail" id="qdetail">
            <p class="instruction qdetail-empty">בחרו שאלה כדי לראות אותה, מה סימנתם ומה התשובה הנכונה.</p>
          </div>
        </div>
      </div>
    </div>`;
}

function renderDomainChapters(domain: ReviewedDomain): string {
  return `
      <div class="chapter-domain">
        <div class="chapter-domain-head">
          <span>${esc(domain.label)}</span>
          ${when(domain.percent !== null, `<b>${domain.percent}%</b>`)}
        </div>
        ${domain.chapters.map((chapter, i) => renderChapterGrid(chapter, i)).join('')}
      </div>`;
}

function renderChapterGrid(chapter: ReviewedChapter, index: number): string {
  return `
        <div class="chapter">
          <h4>חלק ${index + 1}</h4>
          <div class="qgrid">
            ${chapter.questions
              .map(
                (question) => `
              <button class="qcell ${question.status}" data-item="${esc(question.itemId)}"
                      aria-label="שאלה ${question.number}">
                <span class="qnum">${question.number}</span>
                <span class="mark ${question.status}"></span>
              </button>`,
              )
              .join('')}
          </div>
        </div>`;
}

export function renderResults(vm: ResultsViewModel): string {
  const { report } = vm;
  const present = DOMAINS.filter(([domain]) => report.attempted[domain] > 0);

  return `
  <div class="stage"><div class="sheet wide stagger" style="padding-block-start:min(8dvh,64px)">
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

    ${
      // A general score weighs all three domains together. Sit one of them and
      // the other two score 50, which would read as a number rather than as a
      // missing one — so it is withheld instead of published wrong.
      present.length === DOMAINS.length
        ? `<div class="card">
      <h3>אומדן ציון כללי</h3>
      <div class="stats" style="margin-block-start:16px">
        <div class="stat" style="box-shadow:none;background:var(--sage-050)"><div class="k">רב־תחומי</div><div class="v">${report.general.multi}</div></div>
        <div class="stat" style="box-shadow:none;background:var(--sage-050)"><div class="k">דגש מילולי</div><div class="v">${report.general.verbalEmphasis}</div></div>
        <div class="stat" style="box-shadow:none;background:var(--sage-050)"><div class="k">דגש כמותי</div><div class="v">${report.general.quantEmphasis}</div></div>
      </div>
      <p class="instruction" style="margin:16px 0 0">בסולם 200–800, לפי טבלאות ההמרה של המועד הזה. האומדן מניח מבחן מלא ואינו כולל את מטלת הכתיבה.</p>
    </div>`
        : `<div class="card"><h3>אומדן ציון כללי</h3>
      <p class="instruction" style="margin:10px 0 0">ציון כללי משוקלל משלושת התחומים. במושב חלקי הוא לא מחושב — הציונים שלמעלה הם מה שנמדד.</p>
    </div>`
    }

    ${when(
      vm.essay.trim(),
      `<div class="card"><h3>החיבור שלך</h3><div class="passage" style="max-height:32dvh">${paragraphs(vm.essay)}</div></div>`,
    )}

    ${renderChapters(vm)}

    <div class="controls">
      <button class="btn" id="again">להריץ שוב</button>
      <button class="btn quiet" id="dl">להוריד את התשובות</button>
      ${when(vm.essay.trim(), `<button class="btn quiet" id="dl-essay">להוריד את החיבור (Word)</button>`)}
      ${when(vm.essay.trim() && vm.canSend, `<button class="btn quiet" id="send-essay">לשלוח לבדיקה</button>`)}
    </div>
    <p class="tag" id="send-note" style="text-align:center;margin:14px 0 0"></p>
    ${when(vm.canSend, renderNotice(SENDING_NOT_READY))}
    <div style="display:none">
    </div>
  </div></div>`;
}
