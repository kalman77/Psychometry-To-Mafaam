/* The opening screen: drop a bank, choose a length, start. */

import type { BankProblem } from '../../../domain/services/bank-validator.ts';
import type { Identity, SavedProgress, StoredBank } from '../ports.ts';
import { minutesOf } from '../../../domain/support/duration.ts';
import { esc, when } from '../html.ts';
import type { SetupViewModel } from './setup-view/setup-view-model.ts';

export type { SetupConfig } from './setup-view/setup-config.ts';
export type { SetupViewModel } from './setup-view/setup-view-model.ts';

export function renderSetup(vm: SetupViewModel): string {
  return `
  <div class="stage"><div class="sheet narrow stagger" style="padding-block-start:min(11dvh,90px)">
    <header style="text-align:center">
      <p class="tag">מפע״ם · בחינה בזמן קצוב לכל שאלה</p>
      <h1 style="margin-block:14px 12px">רגע אחד לכל שאלה</h1>
      <p style="color:var(--muted);max-width:46ch;margin:0 auto">כל שאלה מקבלת את הזמן שהיא מקבלת במפע״ם. כשהזמן נגמר עוברים הלאה, ואין חזרה אחורה.</p>
    </header>

    ${when(vm.message, `<div class="notice warn">${esc(vm.message)}</div>`)}

    <div id="drop" class="drop">
      <b>גררו לכאן חוברת בחינה או בנק שאלות</b><br>
      <span style="color:var(--muted);font-size:15px">PDF של חוברת, או קובץ JSON מוכן</span>
      <input id="file" type="file" accept=".json,application/json,.pdf,application/pdf" hidden>
    </div>
    <div style="text-align:center;margin-block-start:-8px">
      <button class="btn quiet" id="demo">להתחיל מבנק הדוגמה</button>
    </div>

    ${when(vm.identity, vm.identity ? renderAccount(vm.identity) : '')}
    ${when(vm.library.length, renderLibrary(vm.library))}
    ${when(vm.saved, vm.saved ? renderResume(vm.saved) : '')}
    ${vm.bank ? (vm.problems.length ? renderProblems(vm.problems) : renderReady(vm)) : ''}
  </div></div>`;
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
function renderLibrary(banks: StoredBank[]): string {
  return `
  <div class="card library">
    <h3>החוברות שלכם</h3>
    <ul class="library-list">
      ${banks
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
  </div>`;
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
          <input type="text" id="seed" value="${esc(config.seed)}" style="width:70px">
        </div>
        <div class="field">
          <label for="wmin">מטלת כתיבה</label>
          <select id="wmin">${vm.allowedMinutes
            .map((m) => `<option value="${m}"${sel(m === config.writingMinutes)}>${m} דקות</option>`)
            .join('')}</select>
          <label><input type="checkbox" id="skipw"${config.includeWriting ? '' : ' checked'}> לדלג עליה</label>
        </div>
        ${when(
          summary.overBudget,
          `<div class="notice warn" style="margin-block-start:16px">המושב חורג מתקרת ${minutesOf(summary.maxSeconds)} הדקות. בחרו אורך קצר יותר.</div>`,
        )}
        ${when(
          summary.notes.length,
          `<div class="notice" style="margin-block-start:16px"><b>הבנק קטן מהמתוכנן:</b><ul>${summary.notes
            .map((n) => `<li>${esc(n)}</li>`)
            .join('')}</ul></div>`,
        )}
      </div>
      <div style="text-align:center"><button class="btn" id="start">להתחיל</button></div>`;
}

function sel(selected: boolean): string {
  return selected ? ' selected' : '';
}
