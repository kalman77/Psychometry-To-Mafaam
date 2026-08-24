/* One view per step kind. Each takes a step and returns HTML — no DOM, no
 * state, no timers, so a screen can be rendered and diffed in isolation. */

import type {
  BreakStep,
  SectionIntroStep,
  StimulusStep,
  WritingStep,
} from '../../../domain/model/sitting.ts';
import { domainLabel, typeLabel } from '../../../domain/rules/labels.ts';
import { formatDuration } from '../../../domain/support/duration.ts';
import { directionOf, esc, isHebrew, paragraphs, when } from '../html.ts';
import type { ItemViewModel } from './step-views/item-view-model.ts';

export function renderSectionIntro(step: SectionIntroStep): string {
  return `
  <div class="bleed">
    <p class="tag">${esc(domainLabel(step.domain))}</p>
    <h1>${esc(step.title)}</h1>
    ${when(
      step.subtitle,
      `<p style="color:#8CA096;max-width:44ch;margin:0">${esc(step.subtitle)}</p>`,
    )}
    <p class="tag">${step.itemCount} שאלות · לכל אחת זמן משלה</p>
    <button class="btn" id="go">להתחיל</button>
  </div>`;
}

export function renderBreak(step: BreakStep, skippable: boolean): string {
  return `
  <div class="bleed">
    <p class="tag">הפסקה</p>
    <div class="breath-wrap">
      <div class="breath"></div><div class="breath b2"></div>
      <div class="breath-inner">
        <div class="big" id="bigclock">${formatDuration(step.seconds)}</div>
        <p class="tag" style="color:#6E8278">נשמו יחד עם המעגל</p>
      </div>
    </div>
    <p style="color:#8CA096;margin:0">הבחינה תמשיך מעצמה כשההפסקה תסתיים.</p>
    ${when(skippable, `<button class="btn" id="go">לקצר את ההפסקה</button>`)}
  </div>`;
}

export function renderWriting(step: WritingStep): string {
  /* Scanned, the task is a picture of the page and needs the width to match. */
  const scan = Boolean(step.image) && !step.prompt;
  return `
  <div class="stage">
    <div class="topbar"><span class="tag">מטלת כתיבה</span><span class="tag dot">${step.seconds / 60} דקות</span></div>
    <div class="sheet ${scan ? 'wide' : 'narrow'}">
      <div class="card">
        ${when(step.intro, `<p class="instruction">${esc(step.intro)}</p>`)}
        ${when(step.prompt, `<div class="stem">${esc(step.prompt)}</div>`)}
        ${when(step.image, `<img class="scan-passage" src="${esc(step.image)}" alt="">`)}
      </div>
      <textarea id="essay" placeholder="כתבו כאן…" spellcheck="false">${esc(step.essay)}</textarea>
      <div class="meter">
        <span id="lw">שורות <b id="lines">0</b> מתוך ${step.minLines}</span>
        <span>מילים <b id="words">0</b></span>
      </div>
    </div>
    <div class="controls"><button class="btn" id="go">סיימתי</button><span class="hint"><kbd>Ctrl</kbd> <kbd>Enter</kbd></span></div>
  </div>`;
}

/** A passage lifted off the page scan rather than out of the text layer. */
export function isScan(step: StimulusStep): boolean {
  return Boolean(step.image) && !step.body && !step.html;
}

/** The passage or table itself — shown alone first, then beside its questions. */
export function renderStimulusBody(step: StimulusStep, maxHeight: string): string {
  const dir = step.dir ?? (isHebrew((step.body ?? '') + (step.title ?? '')) ? 'rtl' : 'ltr');
  return (
    `<div class="passage" dir="${dir}" style="max-height:${maxHeight}">` +
    `${step.html ?? ''}${step.body ? paragraphs(step.body) : ''}` +
    when(
      step.image,
      `<img class="${isScan(step) ? 'scan-passage' : 'inline-figure'}" src="${esc(step.image)}" alt="">`,
    ) +
    `</div>`
  );
}

export function renderStimulus(step: StimulusStep): string {
  /* A scanned passage is a picture of a page: shrunk into the narrow sheet it
   * is unreadable, so it gets the full width the same way a scanned question does. */
  const scan = isScan(step);
  return `
  <div class="stage">
    <div class="topbar"><span class="tag">${esc(domainLabel(step.domain))}</span><span class="tag dot">זמן קריאה · ${Math.round(step.seconds / 60)} דקות</span></div>
    <div class="sheet ${scan ? 'wide' : 'narrow'} centred"><div class="card"><h3>${esc(step.title)}</h3>${renderStimulusBody(step, scan ? '74dvh' : '58dvh')}</div></div>
    <div class="controls"><button class="btn" id="go">קראתי, לשאלות</button><span class="hint"><kbd>Enter</kbd></span></div>
  </div>`;
}

export type { ItemViewModel } from './step-views/item-view-model.ts';

/** The passage or chart behind a question, parked at the edge of the screen.
 *
 * The rulebook wants the source kept with its questions, and a split screen is
 * the literal reading of that — but it shrinks both halves, which is exactly
 * what makes a scan unreadable. A drawer keeps the source one tap away and
 * lets the question itself have the whole page. */
function renderSource(stimulus: StimulusStep): string {
  const label = stimulus.stimulusKind === 'figure' ? 'התרשים' : 'קטע הקריאה';
  return `
  <button class="source-tab" id="source-open" aria-controls="source" aria-expanded="false">
    <span class="source-chevron" aria-hidden="true"></span><span>${esc(label)}</span>
  </button>
  <div class="source" id="source" data-open="false">
    <div class="source-scrim" id="source-scrim"></div>
    <aside class="source-panel" role="dialog" aria-modal="true" aria-label="${esc(label)}">
      <header class="source-head">
        <h3>${esc(stimulus.title)}</h3>
        <button class="source-shut" id="source-shut" aria-label="סגירה">✕</button>
      </header>
      ${renderStimulusBody(stimulus, 'calc(100dvh - 108px)')}
    </aside>
  </div>`;
}

export function renderItem(vm: ItemViewModel): string {
  const { step, stimulus } = vm;
  const dir = directionOf(step.dir, step.stem);
  const minutes = step.seconds % 60 ? (step.seconds / 60).toFixed(1) : step.seconds / 60;
  /* A question lifted straight off the page scan: the picture is the question,
   * so it gets the width the text would have used and the options collapse to
   * the row of numbers you would mark on an answer sheet. */
  const scan = !step.stem && step.options.every((option) => !option);
  /* A scanned question is centred like any other and reaches its source
   * through the drawer; only a text bank still splits the screen. */
  const drawer = scan && stimulus !== null;
  const width = drawer || (scan && !stimulus) ? 'wide' : stimulus ? 'split' : 'narrow';

  return `
  <div class="stage">
    <div class="topbar">
      <span class="tag">${esc(domainLabel(step.domain))}</span>
      <span class="tag dot">${esc(typeLabel(step.type))}</span>
      <span class="tag dot">${vm.position} מתוך ${vm.of}</span>
      <span class="tag dot">${minutes} דק׳</span>
    </div>
    <div class="sheet ${width}${scan ? ' scan' : ''} centred">
      ${when(
        stimulus && !drawer,
        stimulus
          ? `<div class="card"><h3>${esc(stimulus.title)}</h3>${renderStimulusBody(stimulus, '54dvh')}</div>`
          : '',
      )}
      <div class="card">
        ${when(step.instruction, `<p class="instruction">${esc(step.instruction)}</p>`)}
        ${when(step.stem, `<div class="stem" dir="${dir}">${esc(step.stem)}</div>`)}
        ${when(
          step.image,
          `<img class="${scan ? 'scan-img' : 'stem-img'}" src="${esc(step.image)}" alt="">`,
        )}
        <div class="options" role="radiogroup">
          ${step.options
            .map(
              (option, i) => `
            <button class="opt" role="radio" aria-checked="false" data-i="${i + 1}" dir="${dir}">
              <span class="pip"></span><span class="label">${option ? esc(option) : i + 1}</span>
            </button>`,
            )
            .join('')}
        </div>
      </div>
    </div>
    ${when(drawer, stimulus ? renderSource(stimulus) : '')}
    <div class="controls">
      <button class="btn" id="go">המשך</button>
      <span class="hint"><kbd>1</kbd>–<kbd>4</kbd> לבחירה${
        drawer ? ' · <kbd>רווח</kbd> לקטע' : ''
      } · <kbd>Enter</kbd> להמשך</span>
    </div>
  </div>`;
}
