/* The opening screen: drop a bank, choose a length, start. */

import type { Domain } from '../../../domain/model/bank/domain.ts';
import type { BankProblem } from '../../../domain/services/bank-validator.ts';
import type { Identity, SavedProgress, StoredBank } from '../ports.ts';
import { VERSIONS, versionLabel } from '../../../domain/rules/labels.ts';
import { minutesOf } from '../../../domain/support/duration.ts';
import { esc, when } from '../html.ts';
import type { SetupViewModel } from './setup-view/setup-view-model.ts';

export type { SetupConfig } from './setup-view/setup-config.ts';
export type { SetupViewModel } from './setup-view/setup-view-model.ts';

export function renderSetup(vm: SetupViewModel): string {
  return `
  <div class="stage setup-stage">
    <div class="setup-wash" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="sheet narrow stagger" style="padding-block-start:min(9dvh,74px)">
      <header class="hero">
        <div class="hero-logo" role="img" aria-label="מפע״ם"></div>
        <p class="tag hero-eyebrow">מפע״ם · בחינה בזמן קצוב לכל שאלה</p>
        <h1 class="hero-title">רגע אחד לכל שאלה</h1>
        <p class="hero-sub">כל שאלה מקבלת את הזמן שהיא מקבלת במפע״ם. כשהזמן נגמר עוברים הלאה, ואין חזרה אחורה.</p>
      </header>

      ${when(vm.message, `<div class="notice warn">${esc(vm.message)}</div>`)}

      <div class="intake">
        <div id="drop" class="drop">
          <span class="drop-mark" aria-hidden="true"></span>
          <b>גררו לכאן חוברת בחינה או בנק שאלות</b>
          <span class="drop-hint">PDF של חוברת, או קובץ JSON מוכן</span>
          <input id="file" type="file" accept=".json,application/json,.pdf,application/pdf" hidden>
        </div>
        <div class="intake-or"><span>או</span></div>
        <button class="btn quiet intake-demo" id="demo">להתחיל מבנק הדוגמה</button>
      </div>

      ${when(vm.identity, vm.identity ? renderAccount(vm.identity) : '')}
      ${when(vm.library.length, renderLibrary(vm.library, vm.libraryPage))}
      ${when(vm.saved, vm.saved ? renderResume(vm.saved) : '')}
      ${vm.bank ? (vm.problems.length ? renderProblems(vm.problems) : renderReady(vm)) : ''}
    </div>
  </div>`;
}

/** The offered versions, plus whatever the config already holds if it is not
 *  one of them — a resumed run must keep its own seed, and silently swapping it
 *  for the nearest option would rebuild a different paper. */
function versionOptions(seed: string): string {
  const offered = VERSIONS.some((version) => version.seed === seed)
    ? VERSIONS
    : [...VERSIONS, { seed, label: versionLabel(seed) }];
  return offered
    .map((v) => `<option value="${esc(v.seed)}"${sel(v.seed === seed)}>${esc(v.label)}</option>`)
    .join('');
}

function renderAccount(identity: Identity): string {
  return `
  <div class="account">
    <span>${esc(identity.name)}</span>
    <a href="/me" class="account-out">העמוד שלי</a>
    <a href="/logout" class="account-out">יציאה</a>
  </div>`;
}

const megabytes = (bytes: number): string => `${(bytes / 1e6).toFixed(1)} MB`;

/** Booklets already on the server: uploading one is slow and it is the same
 *  file every time, so the second sitting should not need the PDF at all. */
/** The domains a sitting can be limited to. Order matches the booklet's. */
const DOMAIN_CHOICES: [Domain, string][] = [
  ['verbal', 'מילולי'],
  ['quantitative', 'כמותי'],
  ['english', 'אנגלית'],
];

/** Booklets to a page. More than a few and the shelf pushes the setup screen
 *  off the bottom, which is where the length and the start button live. */
export const LIBRARY_PAGE_SIZE = 3;

/** The page `page` falls on, once the shelf has grown or shrunk under it. */
export function libraryPageCount(total: number): number {
  return Math.max(1, Math.ceil(total / LIBRARY_PAGE_SIZE));
}

export function clampLibraryPage(page: number, total: number): number {
  return Math.max(0, Math.min(page, libraryPageCount(total) - 1));
}

function renderLibrary(banks: StoredBank[], page: number): string {
  return `
  <div class="card library">
    <h3>החוברות שלכם</h3>
    <div id="library-body">${renderLibraryPage(banks, page)}</div>
  </div>`;
}

/** Just the shelf: the rows on this page and the pager under them.
 *
 *  Kept apart from the card around it so turning a page can replace this much
 *  and leave the screen alone — a repaint of the whole setup screen replays its
 *  entrance animation, which reads as the page flashing every time. */
export function renderLibraryPage(banks: StoredBank[], page: number): string {
  const pages = libraryPageCount(banks.length);
  const current = clampLibraryPage(page, banks.length);
  const start = current * LIBRARY_PAGE_SIZE;
  const showing = banks.slice(start, start + LIBRARY_PAGE_SIZE);

  return `
    <ul class="library-list">
      ${showing
        .map(
          (bank) => `
        <li>
          <button class="library-open" data-bank="${esc(bank.id)}">
            <b>${esc(bank.title)}</b>
            <span class="tag">${bank.items} שאלות · ${megabytes(bank.bytes)}</span>
          </button>
          <button class="library-drop" data-bank="${esc(bank.id)}" aria-label="מחיקה">✕</button>
        </li>`,
        )
        .join('')}
    </ul>
    ${when(
      pages > 1,
      `<div class="library-pager">
        <button class="btn quiet" id="lib-prev"${current === 0 ? ' disabled' : ''}>הקודם</button>
        <span class="tag">עמוד ${current + 1} מתוך ${pages}</span>
        <button class="btn quiet" id="lib-next"${
          current >= pages - 1 ? ' disabled' : ''
        }>הבא</button>
      </div>`,
    )}`;
}

/** How long ago a run was left, in the roundest words that are still true. */
function ago(savedAt: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - savedAt) / 60000));
  if (minutes < 1) return 'לפני רגע';
  if (minutes < 60) return `לפני ${minutes} דקות`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  return `לפני ${Math.round(hours / 24)} ימים`;
}

function renderResume(saved: SavedProgress): string {
  const answered = Object.values(saved.responses).filter((choice) => choice != null).length;
  return `
  <div class="card resume">
    <div>
      <b>יש בחינה שלא הסתיימה</b>
      <p class="tag" style="margin:6px 0 0">${esc(ago(saved.savedAt))} · ${answered} שאלות נענו</p>
    </div>
    <div class="resume-actions">
      <button class="btn quiet" id="discard">להתחיל מחדש</button>
      <button class="btn" id="resume">להמשיך מאיפה שהפסקתי</button>
    </div>
  </div>`;
}

function renderProblems(problems: BankProblem[]): string {
  return `
      <div class="notice warn">
        <b>הבנק לא תקין (${problems.length}):</b>
        <ul>${problems
          .slice(0, 10)
          .map((p) => `<li>${esc(p.message)}</li>`)
          .join('')}</ul>
      </div>`;
}

function renderReady(vm: SetupViewModel): string {
  const preview = vm.preview;
  if (!preview) return '';
  const { summary } = preview;
  const { config } = vm;

  return `
      <div class="card">
        <h3>${esc(vm.bank?.meta?.title ?? 'בנק ללא שם')}</h3>
        <div class="stats" style="margin-block-start:18px">
          <div class="stat"><div class="k">שאלות</div><div class="v">${summary.counts.items}</div></div>
          <div class="stat"><div class="k">קטעים ותרשימים</div><div class="v">${summary.counts.stimuli}</div></div>
          <div class="stat"><div class="k">משך המושב</div><div class="v">${minutesOf(summary.totalSeconds)}<small> מתוך ${minutesOf(summary.maxSeconds)} דק׳</small></div></div>
        </div>
        <div class="field">
          <label for="bp">אורך</label>
          <select id="bp">
            <option value="standard"${sel(config.blueprint === 'standard')}>מפע״ם מלא — דגימה מהבנק</option>
            <option value="half"${sel(config.blueprint === 'half')}>חצי אורך — הרצת חימום</option>
            <option value="full"${sel(config.blueprint === 'full')}>כל מה שיש בבנק</option>
          </select>
          <label for="seed">גרסה</label>
          <select id="seed">${versionOptions(config.seed)}</select>
        </div>
        <div class="field">
          <label for="wmin">מטלת כתיבה</label>
          <select id="wmin">${vm.allowedMinutes
            .map((m) => `<option value="${m}"${sel(m === config.writingMinutes)}>${m} דקות</option>`)
            .join('')}</select>
          <label><input type="checkbox" id="skipw"${config.includeWriting ? '' : ' checked'}> לדלג עליה</label>
        </div>
        <div class="field">
          <label>תחומים</label>
          ${DOMAIN_CHOICES.map(
            ([domain, label]) => `
            <label><input type="checkbox" class="dom" value="${domain}"${
              config.domains.includes(domain) ? ' checked' : ''
            }> ${label}</label>`,
          ).join('')}
        </div>
        <div class="field">
          <label><input type="checkbox" id="uncapped"${config.uncapped ? ' checked' : ''}>
            לאפשר מושב ארוך מ-${minutesOf(summary.maxSeconds)} דק׳</label>
        </div>
        ${when(
          summary.overBudget,
          // Over the ceiling on purpose is a fact to state; over it by accident
          // is something to fix, and only the second is a warning.
          config.uncapped
            ? `<div class="notice" style="margin-block-start:16px">המושב אורך ${minutesOf(summary.totalSeconds)} דק׳ — מעבר לתקרת ${minutesOf(summary.maxSeconds)} הדקות, כפי שביקשתם.</div>`
            : `<div class="notice warn" style="margin-block-start:16px">המושב חורג מתקרת ${minutesOf(summary.maxSeconds)} הדקות. בחרו אורך קצר יותר, או אפשרו מושב ארוך.</div>`,
        )}
        ${when(
          summary.notes.length,
          `<div class="notice" style="margin-block-start:16px"><b>הבנק קטן מהמתוכנן, ולכן המושב קצר מהצפוי:</b><ul>${summary.notes
            .map((n) => `<li>${esc(n)}</li>`)
            .join('')}</ul></div>`,
        )}
      </div>
      <div style="text-align:center"><button class="btn" id="start">להתחיל</button></div>`;
}

function sel(selected: boolean): string {
  return selected ? ' selected' : '';
}
