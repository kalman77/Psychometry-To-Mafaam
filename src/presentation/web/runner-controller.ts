/* The runner's state machine: which step we're on, what the learner answered,
 * how long each question actually took.
 *
 * Everything it touches outside itself is a port — screen, chrome, countdown,
 * file reader, saver — and the two use cases it drives. No `document` here. */

import type { AnswerIndex, Bank, UnverifiedBank } from '../../domain/model/bank.ts';
import type { Responses, TimeSpent } from '../../domain/model/scoring.ts';
import type { ItemStep, Sitting, Step, StimulusStep } from '../../domain/model/sitting.ts';
import { RULES } from '../../domain/rules/rulebook.ts';
import { formatDuration } from '../../domain/support/duration.ts';
import { validateBank, type BankProblem } from '../../domain/services/bank-validator.ts';
import type { SavedProgress } from './ports.ts';
import { renderResults } from './views/results-view.ts';
import { renderSetup, type SetupConfig } from './views/setup-view.ts';
import {
  renderBreak,
  renderItem,
  renderSectionIntro,
  renderStimulus,
  renderWriting,
} from './views/step-views.ts';

import type { RunnerDeps } from './runner-controller/runner-deps.ts';

export type { RunnerDeps } from './runner-controller/runner-deps.ts';

/** Wraps a callback so a step can only be advanced once, however it ended. */
function once(fn: () => void): () => void {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    fn();
  };
}

export class RunnerController {
  private bank: UnverifiedBank | null = null;
  private sitting: Sitting | null = null;
  private cursor = 0;
  private responses: Responses = {};
  private spent: TimeSpent = {};
  private essay = '';
  private config: SetupConfig = defaultConfig();
  /** Seconds left on a step being resumed, consumed by the next runClock. */
  private resuming: number | null = null;
  private readonly deps: RunnerDeps;

  constructor(deps: RunnerDeps) {
    this.deps = deps;
  }

  /** True while a sitting is under way — drives the "are you sure" guard. */
  isRunning(): boolean {
    const step = this.sitting?.steps[this.cursor];
    return !!step && step.kind !== 'end';
  }

  start(): void {
    this.showSetup();
  }

  // -- setup ---------------------------------------------------------------

  private showSetup(message: string | null = null): void {
    const { screen, chrome, countdown } = this.deps;
    countdown.stop();
    chrome.showTime(0, 0, false);
    chrome.showProgress(0);
    this.sitting = null;

    const problems: BankProblem[] = this.bank ? validateBank(this.bank) : [];
    const preview = this.bank && !problems.length ? this.buildPreview() : null;

    screen.render(
      renderSetup({
        message,
        bank: (this.bank as Bank | null) ?? null,
        problems,
        preview,
        config: this.config,
        allowedMinutes: RULES.writing.allowedMinutes,
        saved: this.savedRun(),
      }),
    );

    this.bindSetup();
  }

  private buildPreview(): Sitting | null {
    try {
      return this.deps.buildSitting.execute({ bank: this.bank, ...this.buildOptions() });
    } catch {
      return null;
    }
  }

  private buildOptions() {
    return {
      blueprint: this.config.blueprint,
      seed: this.config.seed,
      writingMinutes: this.config.writingMinutes,
      includeWriting: this.config.includeWriting,
    };
  }

  private bindSetup(): void {
    const { screen } = this.deps;
    const drop = screen.byId('drop');
    const fileInput = screen.byId<HTMLInputElement>('file');

    if (drop && fileInput) {
      drop.onclick = () => fileInput.click();
      drop.ondragover = (event) => {
        event.preventDefault();
        drop.classList.add('over');
      };
      drop.ondragleave = () => drop.classList.remove('over');
      drop.ondrop = (event) => {
        event.preventDefault();
        drop.classList.remove('over');
        void this.loadFile(event.dataTransfer?.files[0]);
      };
      fileInput.onchange = () => void this.loadFile(fileInput.files?.[0]);
    }

    const demo = screen.byId('demo');
    if (demo)
      demo.onclick = () => {
        const example = this.deps.exampleBank ?? null;
        if (!example) return this.showSetup('אין בנק דוגמה מוטמע בקובץ הזה.');
        this.adoptBank(example);
      };

    const wmin = screen.byId<HTMLSelectElement>('wmin');
    if (wmin)
      wmin.onchange = () => this.reconfigure({ writingMinutes: Number(wmin.value) });
    const bp = screen.byId<HTMLSelectElement>('bp');
    if (bp) bp.onchange = () => this.reconfigure({ blueprint: bp.value });
    const seed = screen.byId<HTMLInputElement>('seed');
    if (seed) seed.onchange = () => this.reconfigure({ seed: seed.value });
    const skip = screen.byId<HTMLInputElement>('skipw');
    if (skip) skip.onchange = () => this.reconfigure({ includeWriting: !skip.checked });

    const saved = this.savedRun();
    const resume = screen.byId('resume');
    if (resume && saved) resume.onclick = () => this.resume(saved);
    const discard = screen.byId('discard');
    if (discard)
      discard.onclick = () => {
        this.deps.progress.clear();
        this.showSetup();
      };

    const start = screen.byId('start');
    if (start) start.onclick = () => this.begin();
  }

  private reconfigure(patch: Partial<SetupConfig>): void {
    this.config = { ...this.config, ...patch };
    this.showSetup();
  }

  private async loadFile(file: File | undefined): Promise<void> {
    if (!file) return;
    try {
      this.adoptBank(await this.deps.bankFiles.read(file));
    } catch (error) {
      this.showSetup(`הקובץ אינו JSON תקין: ${(error as Error).message}`);
    }
  }

  private adoptBank(bank: UnverifiedBank): void {
    this.bank = bank;
    this.config = defaultConfig(bank);
    this.showSetup();
  }

  // -- the sitting ---------------------------------------------------------

  private begin(): void {
    this.sitting = this.deps.buildSitting.execute({ bank: this.bank, ...this.buildOptions() });
    this.cursor = 0;
    this.responses = {};
    this.spent = {};
    this.essay = '';
    this.deps.progress.clear();
    this.showStep();
  }

  /** Pick a stopped run back up: the same bank, blueprint and seed rebuild the
   *  same steps, so only the position inside them has to be restored. */
  private resume(saved: SavedProgress): void {
    this.config = saved.config;
    this.sitting = this.deps.buildSitting.execute({ bank: this.bank, ...this.buildOptions() });
    this.cursor = Math.min(saved.cursor, this.sitting.steps.length - 1);
    this.responses = { ...saved.responses };
    this.spent = { ...saved.spent };
    this.essay = saved.essay;
    this.resuming = saved.remaining > 0 ? saved.remaining : null;
    this.paintProgress();
    this.showStep();
  }

  /** The saved run, but only if it belongs to the bank now loaded. */
  private savedRun(): SavedProgress | null {
    const saved = this.deps.progress.load();
    if (!saved || !this.bank) return null;
    return saved.fingerprint === fingerprint(this.bank) ? saved : null;
  }

  /** Bank plus blueprint plus seed rebuild the steps, so those are all that a
   *  save needs alongside the answers. */
  private persist(): void {
    if (!this.sitting || !this.bank) return;
    const step = this.sitting.steps[this.cursor];
    if (!step || step.kind === 'end') return;
    this.deps.progress.save({
      fingerprint: fingerprint(this.bank),
      savedAt: Date.now(),
      config: this.config,
      cursor: this.cursor,
      remaining: Math.round(this.deps.countdown.remaining()),
      responses: this.responses,
      spent: this.spent,
      essay: this.essay,
    });
  }

  private next(): void {
    this.cursor++;
    this.paintProgress();
    this.showStep();
    this.persist();
  }

  private paintProgress(): void {
    if (!this.sitting) return this.deps.chrome.showProgress(0);
    const done = this.sitting.steps
      .slice(0, this.cursor)
      .reduce((n, step) => n + (step.seconds ?? 0), 0);
    this.deps.chrome.showProgress(done / Math.max(1, this.sitting.summary.totalSeconds));
  }

  private showStep(): void {
    this.deps.countdown.stop();
    const step = this.sitting?.steps[this.cursor];
    if (!step || step.kind === 'end') return this.showResults();

    switch (step.kind) {
      case 'section-intro':
        return this.showIntro(step);
      case 'break':
        return this.showBreak(step);
      case 'writing':
        return this.showWriting(step);
      case 'stimulus':
        return this.showStimulus(step);
      case 'item':
        return this.showItem(step);
      default:
        return this.next();
    }
  }

  /** Runs the clock for a step; `visibleDial` is false during breaks. */
  private runClock(seconds: number, onExpire: () => void, visibleDial = true): void {
    // A resumed step keeps the clock it was interrupted on rather than being
    // handed a fresh one.
    if (this.resuming !== null) {
      seconds = Math.min(seconds, this.resuming);
      this.resuming = null;
    }
    this.deps.countdown.start(seconds, {
      onTick: (remaining, total) => this.deps.chrome.showTime(remaining, total, visibleDial),
      onExpire,
    });
    this.deps.chrome.showTime(seconds, seconds, visibleDial);
  }

  private bindAdvance(advance: () => void): void {
    const button = this.deps.screen.byId('go');
    if (button) button.onclick = advance;
    this.deps.screen.onKey((event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        advance();
      }
    });
  }

  private showIntro(step: Extract<Step, { kind: 'section-intro' }>): void {
    this.deps.chrome.showTime(0, 0, false);
    this.deps.screen.render(renderSectionIntro(step));
    this.bindAdvance(once(() => this.next()));
  }

  private showBreak(step: Extract<Step, { kind: 'break' }>): void {
    const { screen, countdown } = this.deps;
    screen.render(renderBreak(step, this.rules().breaks.skippable));

    const bigClock = screen.byId('bigclock');
    const advance = once(() => this.next());

    countdown.start(step.seconds, {
      onTick: (remaining, total) => {
        this.deps.chrome.showTime(remaining, total, false);
        if (bigClock) bigClock.textContent = formatDuration(remaining);
      },
      onExpire: advance,
    });
    this.deps.chrome.showTime(step.seconds, step.seconds, false);
    this.bindAdvance(advance);
  }

  private showWriting(step: Extract<Step, { kind: 'writing' }>): void {
    const { screen } = this.deps;
    screen.render(renderWriting(step));

    const textarea = screen.byId<HTMLTextAreaElement>('essay');
    const words = screen.byId('words');
    const lines = screen.byId('lines');
    const meter = screen.byId('lw');

    const update = () => {
      this.essay = textarea?.value ?? '';
      const wordCount = (this.essay.trim().match(/\S+/g) ?? []).length;
      // A line on paper is ~62 characters; long paragraphs wrap into several.
      const lineCount = this.essay
        .split('\n')
        .reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 62)), 0);
      if (words) words.textContent = String(wordCount);
      if (lines) lines.textContent = String(lineCount);
      meter?.classList.toggle('short', lineCount < step.minLines);
    };

    if (textarea) {
      textarea.oninput = update;
      textarea.focus();
    }
    update();

    const finish = once(() => {
      this.essay = textarea?.value ?? this.essay;
      this.next();
    });

    this.runClock(step.seconds, finish);
    const go = screen.byId('go');
    if (go) go.onclick = finish;
    screen.onKey((event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        finish();
      }
    });
  }

  private showStimulus(step: StimulusStep): void {
    this.deps.screen.render(renderStimulus(step));
    const advance = once(() => this.next());
    this.runClock(step.seconds, advance);
    this.bindAdvance(advance);
  }

  private showItem(step: ItemStep): void {
    const { screen, countdown } = this.deps;
    const steps = this.sitting?.steps ?? [];

    const stimulus =
      (step.stimulusId
        ? (steps.find(
            (other): other is StimulusStep =>
              other.kind === 'stimulus' && other.stimulusId === step.stimulusId,
          ) ?? null)
        : null);

    const siblings = steps.filter(
      (other): other is ItemStep => other.kind === 'item' && other.sectionId === step.sectionId,
    );

    screen.render(
      renderItem({
        step,
        stimulus,
        position: siblings.indexOf(step) + 1,
        of: siblings.length,
      }),
    );

    const options = screen.all<HTMLElement>('.opt');
    const choose = (choice: AnswerIndex) => {
      this.responses[step.itemId] = choice;
      for (const option of options)
        option.setAttribute('aria-checked', String(Number(option.dataset.i) === choice));
      this.persist();
    };
    for (const option of options)
      option.onclick = () => choose(Number(option.dataset.i) as AnswerIndex);

    // Resuming onto a question already answered should show that answer, not
    // an empty row: you can be interrupted between choosing and continuing.
    const already = this.responses[step.itemId];
    if (already != null)
      for (const option of options)
        option.setAttribute('aria-checked', String(Number(option.dataset.i) === already));

    const finish = once(() => {
      this.spent[step.itemId] = Math.round(countdown.total() - countdown.remaining());
      this.next();
    });

    // The source drawer, when this question has a passage or chart behind it.
    const source = screen.byId('source');
    const tab = screen.byId('source-open');
    const setSource = (open: boolean): void => {
      if (!source) return;
      source.dataset.open = String(open);
      tab?.setAttribute('aria-expanded', String(open));
    };
    if (source && tab) {
      tab.onclick = () => setSource(source.dataset.open !== 'true');
      const shut = screen.byId('source-shut');
      if (shut) shut.onclick = () => setSource(false);
      const scrim = screen.byId('source-scrim');
      if (scrim) scrim.onclick = () => setSource(false);
    }

    this.runClock(step.seconds, finish);
    const go = screen.byId('go');
    if (go) go.onclick = finish;
    screen.onKey((event) => {
      if (/^[1-4]$/.test(event.key)) {
        event.preventDefault();
        choose(Number(event.key) as AnswerIndex);
      } else if (event.code === 'Space' && source) {
        // Space peeks at the source; it is the one key a Hebrew layout and a
        // Latin one agree on.
        event.preventDefault();
        setSource(source.dataset.open !== 'true');
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setSource(false);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        finish();
      }
    });
  }

  // -- results -------------------------------------------------------------

  private showResults(): void {
    const { screen, chrome, countdown, scoreAttempt, saver } = this.deps;
    countdown.stop();
    this.deps.progress.clear();
    chrome.showTime(0, 0, false);
    chrome.showProgress(1);
    screen.onKey(null);

    const sitting = this.sitting;
    if (!sitting) return this.showSetup();

    const attempt = scoreAttempt.execute({
      sitting,
      responses: this.responses,
      spent: this.spent,
      essay: this.essay,
    });

    screen.render(
      renderResults({ report: attempt.score, spent: this.spent, essay: this.essay }),
    );

    const again = screen.byId('again');
    if (again) again.onclick = () => this.showSetup();

    const download = screen.byId('dl');
    if (download)
      download.onclick = () =>
        saver.save(`${sitting.meta.id ?? 'mapam'}-attempt.json`, attempt);
  }

  private rules() {
    return this.sitting?.rules ?? RULES;
  }
}

/** Enough of a bank to tell it apart from another one, without hashing several
 *  megabytes of embedded images: its id, its sections and how many items each
 *  holds. A save restored onto a different bank would land on other questions. */
function fingerprint(bank: UnverifiedBank): string {
  const parsed = bank as Bank;
  const sections = (parsed.sections ?? [])
    .map((section) => `${section.id}:${section.items?.length ?? 0}`)
    .join(',');
  return `${parsed.meta?.id ?? '?'}|${sections}`;
}

function defaultConfig(bank?: UnverifiedBank): SetupConfig {
  const minutes = (bank as Bank | undefined)?.writingTask?.minutes;
  return {
    writingMinutes: minutes ?? RULES.writing.defaultMinutes,
    // The real sitting, not the whole bank: three chapters inside the ceiling.
    blueprint: 'standard',
    seed: 'a',
    includeWriting: true,
  };
}
