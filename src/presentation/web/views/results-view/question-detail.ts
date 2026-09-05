/* One question reopened after the fact: what it asked, what was picked, and
 * what was right.
 *
 * Rendered on demand into a panel rather than with the screen — a booklet holds
 * a hundred-odd questions and most of them carry a page scan, so painting them
 * all up front would be megabytes of images nobody asked to see. */

import type { Bank, Item } from '../../../../domain/model/bank.ts';
import { typeLabel } from '../../../../domain/rules/labels.ts';
import { formatDuration } from '../../../../domain/support/duration.ts';
import { esc, when } from '../../html.ts';
import type { ReviewedQuestion } from './chapter-review.ts';

export function findItem(bank: Bank | null, itemId: string): Item | null {
  for (const section of bank?.sections ?? [])
    for (const item of section.items ?? []) if (item.id === itemId) return item;
  return null;
}

/** How one option should read: the right one, the one picked, or neither. */
function optionClass(index: number, question: ReviewedQuestion): string {
  const classes = ['review-opt'];
  if (question.answer === index) classes.push('right');
  if (question.given === index) classes.push('picked');
  return classes.join(' ');
}

export function renderQuestionDetail(
  bank: Bank | null,
  question: ReviewedQuestion,
  seconds: number | undefined,
): string {
  const item = findItem(bank, question.itemId);
  if (!item) return `<p class="instruction">השאלה לא נמצאה בחוברת.</p>`;

  const options = item.options ?? [];
  // A question lifted off the page scan has no text of its own: the picture is
  // the question, and the options are the numbers on the answer sheet.
  const scan = !item.stem && options.every((option) => !option);

  const verdict =
    question.status === 'correct'
      ? '<span class="verdict ok">ענית נכון</span>'
      : question.status === 'blank'
        ? `<span class="verdict blank">לא ענית · הנכונה ${question.answer}</span>`
        : question.status === 'not-asked'
          ? `<span class="verdict skipped">לא נכללה במבחן · הנכונה ${question.answer}</span>`
          : `<span class="verdict no">ענית ${question.given} · הנכונה ${question.answer}</span>`;

  return `
    <div class="qdetail-head">
      <h3>שאלה ${question.number}</h3>
      <span class="tag">${esc(typeLabel(item.type))}</span>
      ${when(seconds !== undefined, `<span class="tag">${formatDuration(seconds ?? 0)}</span>`)}
      ${verdict}
      <button class="btn quiet qdetail-close" id="qdetail-close">לסגור</button>
    </div>
    ${when(item.stem, `<div class="stem">${esc(item.stem ?? '')}</div>`)}
    ${when(item.image, `<img class="${scan ? 'scan-img' : 'stem-img'}" src="${esc(item.image ?? '')}" alt="">`)}
    ${scan ? renderScanOptions(options, question) : renderTextOptions(options, question)}`;
}

/* A scanned question already shows its options in the picture, so all that is
 * left to say is which was picked and which was right — the same row of numbers
 * the sitting itself collapses to. Full-width empty rows would be four blanks. */
function renderScanOptions(options: readonly string[], question: ReviewedQuestion): string {
  return `
    <div class="review-opts scan-opts">
      ${options
        .map(
          (_, i) => `
        <div class="${optionClass(i + 1, question)}">
          <span class="review-opt-n">${i + 1}</span>
          ${when(question.answer === i + 1, '<span class="review-opt-tag">הנכונה</span>')}
          ${when(
            question.given === i + 1 && question.answer !== i + 1,
            '<span class="review-opt-tag">סימנת</span>',
          )}
        </div>`,
        )
        .join('')}
    </div>`;
}

function renderTextOptions(options: readonly string[], question: ReviewedQuestion): string {
  return `
    <div class="review-opts">
      ${options
        .map(
          (option, i) => `
        <div class="${optionClass(i + 1, question)}">
          <span class="review-opt-n">${i + 1}</span>
          <span>${esc(option)}</span>
          ${when(question.answer === i + 1, '<span class="review-opt-tag">התשובה הנכונה</span>')}
          ${when(
            question.given === i + 1 && question.answer !== i + 1,
            '<span class="review-opt-tag">מה שסימנת</span>',
          )}
        </div>`,
        )
        .join('')}
    </div>`;
}
