/* The opening screen: drop a bank, choose a length, start. */

import type { BankProblem } from '../../../domain/services/bank-validator.ts';
import type { Bank } from '../../../domain/model/bank.ts';
import type { Sitting } from '../../../domain/model/sitting.ts';
import { minutesOf } from '../../../domain/support/duration.ts';
import { esc, when } from '../html.ts';

export interface SetupConfig {
  writingMinutes: number;
  /** Blueprint name as chosen in the UI — 'full' means the whole bank. */
  blueprint: string;
  seed: string;
  includeWriting: boolean;
}

export interface SetupViewModel {
  message: string | null;
  bank: Bank | null;
  problems: BankProblem[];
  /** Built from the current config, so the numbers on screen are the real ones. */
  preview: Sitting | null;
  config: SetupConfig;
  allowedMinutes: number[];
}

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
      <b>גררו לכאן בנק שאלות</b><br>
      <span style="color:var(--muted);font-size:15px">או לחצו לבחירת קובץ JSON</span>
      <input id="file" type="file" accept=".json,application/json" hidden>
    </div>
    <div style="text-align:center;margin-block-start:-8px">
      <button class="btn quiet" id="demo">להתחיל מבנק הדוגמה</button>
    </div>

    ${vm.bank ? (vm.problems.length ? renderProblems(vm.problems) : renderReady(vm)) : ''}
  </div></div>`;
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
