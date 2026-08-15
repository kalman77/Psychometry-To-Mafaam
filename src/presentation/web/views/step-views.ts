/* One view per step kind. Each takes a step and returns HTML — no DOM, no
 * state, no timers, so a screen can be rendered and diffed in isolation. */

import type {
  BreakStep,
  ItemStep,
  SectionIntroStep,
  StimulusStep,
  WritingStep,
} from '../../../domain/model/sitting.ts';
import { domainLabel, typeLabel } from '../../../domain/rules/labels.ts';
import { formatDuration } from '../../../domain/support/duration.ts';
import { directionOf, esc, isHebrew, paragraphs, when } from '../html.ts';

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
  return `
  <div class="stage">
    <div class="topbar"><span class="tag">מטלת כתיבה</span><span class="tag dot">${step.seconds / 60} דקות</span></div>
    <div class="sheet narrow">
      <div class="card">
        ${when(step.intro, `<p class="instruction">${esc(step.intro)}</p>`)}
        <div class="stem">${esc(step.prompt)}</div>
      </div>
      <textarea id="essay" placeholder="כתבו כאן…" spellcheck="false"></textarea>
      <div class="meter">
        <span id="lw">שורות <b id="lines">0</b> מתוך ${step.minLines}</span>
        <span>מילים <b id="words">0</b></span>
      </div>
    </div>
    <div class="controls"><button class="btn" id="go">סיימתי</button><span class="hint"><kbd>Ctrl</kbd> <kbd>Enter</kbd></span></div>
  </div>`;
}

/** The passage or table itself — shown alone first, then beside its questions. */
export function renderStimulusBody(step: StimulusStep, maxHeight: string): string {
  const dir = step.dir ?? (isHebrew((step.body ?? '') + (step.title ?? '')) ? 'rtl' : 'ltr');
  return (
    `<div class="passage" dir="${dir}" style="max-height:${maxHeight}">` +
    `${step.html ?? ''}${step.body ? paragraphs(step.body) : ''}` +
    when(
      step.image,
      `<img src="${esc(step.image)}" alt="" style="max-width:100%;border-radius:var(--r-sm)">`,
    ) +
    `</div>`
  );
}

export function renderStimulus(step: StimulusStep): string {
  return `
  <div class="stage">
    <div class="topbar"><span class="tag">${esc(domainLabel(step.domain))}</span><span class="tag dot">זמן קריאה · ${Math.round(step.seconds / 60)} דקות</span></div>
    <div class="sheet narrow"><div class="card"><h3>${esc(step.title)}</h3>${renderStimulusBody(step, '58dvh')}</div></div>
    <div class="controls"><button class="btn" id="go">קראתי, לשאלות</button><span class="hint"><kbd>Enter</kbd></span></div>
  </div>`;
}

export interface ItemViewModel {
  step: ItemStep;
  /** The passage or table this question hangs off, if any. */
  stimulus: StimulusStep | null;
  /** 1-based position within its chapter, and the chapter's size. */
  position: number;
  of: number;
}

export function renderItem(vm: ItemViewModel): string {
  const { step, stimulus } = vm;
  const dir = directionOf(step.dir, step.stem);
  const minutes = step.seconds % 60 ? (step.seconds / 60).toFixed(1) : step.seconds / 60;

  return `
  <div class="stage">
    <div class="topbar">
      <span class="tag">${esc(domainLabel(step.domain))}</span>
      <span class="tag dot">${esc(typeLabel(step.type))}</span>
      <span class="tag dot">${vm.position} מתוך ${vm.of}</span>
      <span class="tag dot">${minutes} דק׳</span>
    </div>
    <div class="sheet${stimulus ? ' split' : ' narrow'}">
      ${when(
        stimulus,
        stimulus
          ? `<div class="card"><h3>${esc(stimulus.title)}</h3>${renderStimulusBody(stimulus, '54dvh')}</div>`
          : '',
      )}
      <div class="card">
        ${when(step.instruction, `<p class="instruction">${esc(step.instruction)}</p>`)}
        <div class="stem" dir="${dir}">${esc(step.stem)}</div>
        ${when(
          step.image,
          `<img src="${esc(step.image)}" alt="" style="max-width:100%;margin-block-start:20px;border-radius:var(--r-sm)">`,
        )}
        <div class="options" role="radiogroup">
          ${step.options
            .map(
              (option, i) => `
            <button class="opt" role="radio" aria-checked="false" data-i="${i + 1}" dir="${dir}">
              <span class="pip"></span><span class="label">${esc(option)}</span>
            </button>`,
            )
            .join('')}
        </div>
      </div>
    </div>
    <div class="controls">
      <button class="btn" id="go">המשך</button>
      <span class="hint"><kbd>1</kbd>–<kbd>4</kbd> לבחירה · <kbd>Enter</kbd> להמשך</span>
    </div>
  </div>`;
}
