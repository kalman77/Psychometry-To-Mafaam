/* A small modal for saying one thing and getting out of the way.
 *
 * Rendered with the screen and toggled by `data-open`, the same way the source
 * drawer is — the Screen port replaces a screen wholesale rather than appending
 * to it, so anything that appears later has to already be in the markup. */

import { esc } from '../html.ts';

export interface Notice {
  id: string;
  title: string;
  body: string;
  dismiss?: string;
}

export function renderNotice(notice: Notice): string {
  return `
  <div class="notice-modal" id="${esc(notice.id)}" data-open="false">
    <div class="notice-scrim" id="${esc(notice.id)}-scrim"></div>
    <div class="notice-card" role="alertdialog" aria-modal="true"
         aria-labelledby="${esc(notice.id)}-title">
      <h3 id="${esc(notice.id)}-title">${esc(notice.title)}</h3>
      <p>${esc(notice.body)}</p>
      <button class="btn" id="${esc(notice.id)}-close">${esc(notice.dismiss ?? 'הבנתי')}</button>
    </div>
  </div>`;
}

/** Sending an essay to the checker is built on the server but deliberately not
 *  wired up in the browser yet, so the button explains itself rather than
 *  failing or quietly doing nothing. */
export const SENDING_NOT_READY: Notice = {
  id: 'send-unavailable',
  title: 'עוד לא זמין',
  body:
    'שליחת החיבור לבדיקה עדיין בפיתוח ותופעל בקרוב. ' +
    'בינתיים אפשר להוריד את החיבור כקובץ Word ולשלוח אותו במייל.',
};
