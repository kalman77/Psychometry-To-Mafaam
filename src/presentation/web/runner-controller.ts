/* The runner's state machine: which step we're on, what the learner answered,
 * how long each question actually took.
 *
 * Everything it touches outside itself is a port — screen, chrome, countdown,
 * file reader, saver — and the two use cases it drives. No `document` here. */

import type { AnswerIndex, Bank, Domain, UnverifiedBank } from '../../domain/model/bank.ts';
import type {
  AnsweredItem,
  Responses,
  ScoreReport,
  TimeSpent,
} from '../../domain/model/scoring.ts';
import type { ItemStep, Sitting, Step, StimulusStep } from '../../domain/model/sitting.ts';
import { RULES } from '../../domain/rules/rulebook.ts';
import { formatDuration } from '../../domain/support/duration.ts';
import { validateBank, type BankProblem } from '../../domain/services/bank-validator.ts';
import type { Identity, SavedProgress, StoredBank } from './ports.ts';
import { renderResults } from './views/results-view.ts';
import { renderSummary } from './views/summary-view.ts';
import { reviewChapters } from './views/results-view/chapter-review.ts';
import { renderQuestionDetail } from './views/results-view/question-detail.ts';
import { BUSY, renderBusy } from './views/busy.ts';
import { SENDING_NOT_READY } from './views/notice.ts';
import {
  clampLibraryPage,
  renderLibraryPage,
  renderSetup,
  type SetupConfig,
} from './views/setup-view.ts';
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
  private identity: Identity | null = null;
  /** Set when the loaded bank came from the server, so a save can point back. */
  private bankId: string | null = null;
  private library: StoredBank[] = [];
  /** Which page of the booklet shelf is showing. View state, not configuration:
   *  it never travels with a saved run or a filed attempt. */
  private libraryPage = 0;
  /** What the overlay is saying, or null when nothing slow is happening. Kept
   *  so a repaint mid-job puts it back rather than losing it. */
  private busyLabel: string | null = null;
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
    // The account is a decoration on a screen that already works, so it is
    // fetched after the first paint rather than delaying it.
    void this.refreshAccount();
  }

  /** The shelf and its pager. Bound on its own because turning a page replaces
   *  only the shelf: repainting the whole setup screen would replay its
   *  entrance animation, and the page would appear to flash on every press. */
  private bindLibrary(): void {
    const { screen } = this.deps;

    for (const button of screen.all<HTMLElement>('.library-open'))
      button.onclick = () => void this.openStored(button.dataset['bank'] ?? '');
    for (const button of screen.all<HTMLElement>('.library-drop'))
      button.onclick = () => void this.forgetStored(button.dataset['bank'] ?? '');

    const turn = (by: number, id: string) => () => {
      const shelf = screen.byId('library-body');
      if (!shelf) return;
      this.libraryPage = clampLibraryPage(this.libraryPage + by, this.library.length);
      shelf.innerHTML = renderLibraryPage(this.library, this.libraryPage);
      this.bindLibrary();

      // The button just pressed was replaced with the rest of the shelf, so the
      // keyboard would be left on nothing. At an end it is now disabled, and
      // the other one is where the learner can still go.
      const again = screen.byId<HTMLButtonElement>(id);
      const landing =
        again && !again.disabled
          ? again
          : screen.byId<HTMLButtonElement>(id === 'lib-next' ? 'lib-prev' : 'lib-next');
      landing?.focus();
    };

    const prev = screen.byId('lib-prev');
    if (prev) prev.onclick = turn(-1, 'lib-prev');
    const next = screen.byId('lib-next');
    if (next) next.onclick = turn(1, 'lib-next');
  }

  /** Pulls who we are and what we uploaded before; a no-op offline. */
  private async refreshAccount(): Promise<void> {
    const account = this.deps.account;
    if (!account) return;
    const [identity, library] = await Promise.all([account.me(), account.banks()]);
    this.identity = identity;
    this.library = library;
    if (!this.sitting) this.showSetup();
  }

  // -- setup ---------------------------------------------------------------

  private showSetup(message: string | null = null): void {
    const { chrome, countdown } = this.deps;
    countdown.stop();
    chrome.showTime(0, 0, false);
    chrome.showProgress(0);
    this.sitting = null;

    const problems: BankProblem[] = this.bank ? validateBank(this.bank) : [];
    const preview = this.bank && !problems.length ? this.buildPreview() : null;

    this.paint(
      renderSetup({
        message,
        bank: (this.bank as Bank | null) ?? null,
        problems,
        preview,
        config: this.config,
        allowedMinutes: RULES.writing.allowedMinutes,
        saved: this.savedRun(),
        identity: this.identity,
        library: this.library,
        libraryPage: this.libraryPage,
      }),
    );

    this.bindSetup();
  }

  private async openStored(id: string): Promise<void> {
    const account = this.deps.account;
    if (!account || !id) return;
    try {
      const bank = await this.working(BUSY.opening, () => account.open(id));
      this.bankId = id;
      this.adoptBank(bank);
    } catch {
      this.showSetup('לא ניתן לטעון את החוברת.');
    }
  }

  private async forgetStored(id: string): Promise<void> {
    const account = this.deps.account;
    if (!account || !id) return;
    await this.working(BUSY.forgetting, () => account.forget(id));
    this.library = this.library.filter((bank) => bank.id !== id);
    // Deleting the last booklet on a page takes that page with it. Kept in step
    // here rather than only at render, so the next turn of the pager counts
    // from where the learner is actually looking.
    this.libraryPage = clampLibraryPage(this.libraryPage, this.library.length);
    this.showSetup();
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
      domains: this.config.domains,
      uncapped: this.config.uncapped,
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
    const seed = screen.byId<HTMLSelectElement>('seed');
    if (seed) seed.onchange = () => this.reconfigure({ seed: seed.value });
    const skip = screen.byId<HTMLInputElement>('skipw');
    if (skip) skip.onchange = () => this.reconfigure({ includeWriting: !skip.checked });
    const boxes = screen.all<HTMLInputElement>('.dom');
    for (const box of boxes)
      box.onchange = () => {
        const picked = boxes.filter((b) => b.checked).map((b) => b.value as Domain);
        // Unticking the last one would leave nothing to sit, so it stays ticked.
        if (!picked.length) return void (box.checked = true);
        this.reconfigure({ domains: picked });
      };

    const uncapped = screen.byId<HTMLInputElement>('uncapped');
    if (uncapped) uncapped.onchange = () => this.reconfigure({ uncapped: uncapped.checked });

    const saved = this.savedRun();
    const resume = screen.byId('resume');
    if (resume && saved) resume.onclick = () => void this.resumeStored(saved);
    const discard = screen.byId('discard');
    if (discard)
      discard.onclick = () => {
        this.deps.progress.clear();
        this.showSetup();
      };

    this.bindLibrary();

    const start = screen.byId('start');
    if (start) start.onclick = () => this.begin();
  }

  private reconfigure(patch: Partial<SetupConfig>): void {
    this.config = { ...this.config, ...patch };
    this.showSetup();
  }

  private async loadFile(file: File | undefined): Promise<void> {
    if (!file) return;
    const attempt = await readAttempt(file);
    if (attempt) return this.viewAttempt(attempt);
    try {
      // A PDF goes to the server for poppler and python to chew on; that is
      // seconds of nothing, and the reason the overlay exists.
      const loaded = await this.working(BUSY.extracting, () =>
        this.deps.bankFiles.read(file),
      );
      this.bankId = loaded.storedId ?? null;
      this.adoptBank(loaded.bank);
      // The upload just added a booklet to the library; show it there too.
      void this.refreshAccount();
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
    if (!saved) return null;
    // Straight after a reload there is no bank in memory yet. If the run names
    // a booklet this account still has, offer it anyway and fetch on the way in.
    if (!this.bank)
      return saved.bankId && this.library.some((bank) => bank.id === saved.bankId)
        ? saved
        : null;
    return saved.fingerprint === fingerprint(this.bank) ? saved : null;
  }

  /** Resume needs the bank; after a reload it has to be fetched first. */
  private async resumeStored(saved: SavedProgress): Promise<void> {
    const account = this.deps.account;
    if (this.bank) return this.resume(saved);
    if (!account || !saved.bankId) return;
    try {
      const bank = await this.working(BUSY.opening, () => account.open(saved.bankId!));
      this.bankId = saved.bankId;
      this.bank = bank;
      this.resume(saved);
    } catch {
      this.showSetup('לא ניתן לטעון את החוברת.');
    }
  }

  /** Bank plus blueprint plus seed rebuild the steps, so those are all that a
   *  save needs alongside the answers. */
  private persist(): void {
    if (!this.sitting || !this.bank) return;
    const step = this.sitting.steps[this.cursor];
    if (!step || step.kind === 'end') return;
    this.deps.progress.save({
      fingerprint: fingerprint(this.bank),
      ...(this.bankId ? { bankId: this.bankId } : {}),
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
  /** Seconds between heartbeat saves while a step runs. */
  private static readonly SAVE_EVERY = 3;

  private runClock(seconds: number, onExpire: () => void, visibleDial = true): void {
    // A resumed step keeps the clock it was interrupted on rather than being
    // handed a fresh one.
    if (this.resuming !== null) {
      seconds = Math.min(seconds, this.resuming);
      this.resuming = null;
    }
    this.deps.countdown.start(seconds, {
      onTick: (remaining, total) => {
        this.deps.chrome.showTime(remaining, total, visibleDial);
        // Without this, a question nobody answered is only saved on the way in,
        // so the minute spent thinking about it is handed back on resume. The
        // clock is the one piece of state that changes without the learner
        // touching anything, so it needs a heartbeat rather than an event.
        if (Math.round(remaining) % RunnerController.SAVE_EVERY === 0) this.persist();
      },
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
    this.paint(renderSectionIntro(step));
    this.bindAdvance(once(() => this.next()));
  }

  private showBreak(step: Extract<Step, { kind: 'break' }>): void {
    const { screen, countdown } = this.deps;
    this.paint(renderBreak(step, this.rules().breaks.skippable));

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
    this.paint(
      renderWriting({ ...step, essay: this.essay, canSend: Boolean(this.deps.postEssay) }),
    );

    const textarea = screen.byId<HTMLTextAreaElement>('essay');
    const words = screen.byId('words');
    const lines = screen.byId('lines');
    const meter = screen.byId('lw');

    const update = () => {
      // The clock's heartbeat persists this a few seconds later; typing does
      // not need its own timer on top of it.
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

    const send = screen.byId('send-essay');
    if (send) send.onclick = () => this.sendEssay();

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
    this.paint(renderStimulus(step));
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

    this.paint(
      renderItem({ step, stimulus }),
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

  /** What to call a file from this sitting: the booklet's own sitting when it
   *  named one, its title otherwise, and a plain fallback for a bank that
   *  carries neither. */
  private sessionName(): string {
    const meta = this.sitting?.meta ?? {};
    return meta.session ?? meta.title ?? 'מפעם';
  }

  /** Files the finished sitting so the statistics page has it even after the
   *  booklet itself is deleted. Best effort: a failed POST must not stand
   *  between the learner and their results. */
  private async recordAttempt(): Promise<void> {
    const account = this.deps.account;
    // Only a booklet the server holds can be scored there, so a sitting of a
    // locally dropped file is simply not filed.
    if (!account || !this.sitting || !this.bankId) return;
    // Deliberately not behind the busy overlay: this is fired and forgotten so
    // the results appear at once, and a spinner over them would be exactly the
    // wait the caller is written to avoid.
    await account.record({
      bankId: this.bankId,
      blueprint: this.config.blueprint,
      seed: this.config.seed,
      writingMinutes: this.config.writingMinutes,
      includeWriting: this.config.includeWriting,
      uncapped: this.config.uncapped,
      domains: this.config.domains,
      responses: this.responses,
      spent: this.spent,
    });
  }

  /* Sending an essay works end to end on the server — the endpoint, the mail
   * and the counter are all built and tested — but it is deliberately not
   * called from here yet. Delete this guard and restore the body below to turn
   * it on; nothing else has to change. */
  private sendEssay(): void {
    this.openNotice(SENDING_NOT_READY.id);
  }

  /** Every screen is painted through here, so the busy overlay is part of all
   *  of them. A repaint while a job is running would otherwise wipe it. */
  private paint(html: string): void {
    this.deps.screen.render(html + renderBusy());
    if (this.busyLabel !== null) this.showBusy(this.busyLabel);
  }

  /** Runs a slow job behind the overlay, and takes it down however the job
   *  ends — an error must not leave the screen locked. */
  private async working<T>(label: string, job: () => Promise<T>): Promise<T> {
    this.busyLabel = label;
    this.showBusy(label);
    try {
      return await job();
    } finally {
      this.busyLabel = null;
      const overlay = this.deps.screen.byId('busy');
      if (overlay) overlay.dataset['open'] = 'false';
    }
  }

  private showBusy(label: string): void {
    const { screen } = this.deps;
    const overlay = screen.byId('busy');
    if (!overlay) return;
    const text = screen.byId('busy-label');
    if (text) text.textContent = label;
    overlay.dataset['open'] = 'true';
  }

  /** Opens a question from the review grid. The detail is painted on demand:
   *  a booklet's worth of page scans is megabytes, and most of them are never
   *  looked at. */
  private bindReview(detail: readonly AnsweredItem[]): void {
    const { screen } = this.deps;
    const panel = screen.byId('qdetail');
    if (!panel) return;

    const chapters = reviewChapters(this.bank as Bank | null, detail);
    const questions = new Map(
      chapters.flatMap((domain) =>
        domain.chapters.flatMap((chapter) =>
          chapter.questions.map((question) => [question.itemId, question] as const),
        ),
      ),
    );

    // The panel keeps its place in the column rather than appearing and
    // vanishing: a pane that collapses on close makes the grid beside it jump.
    const empty = panel.innerHTML;
    const close = (): void => {
      panel.innerHTML = empty;
      for (const cell of screen.all<HTMLElement>('.qcell')) cell.classList.remove('open');
    };

    for (const cell of screen.all<HTMLElement>('.qcell')) {
      cell.onclick = () => {
        const question = questions.get(cell.dataset['item'] ?? '');
        if (!question) return;

        for (const other of screen.all<HTMLElement>('.qcell')) other.classList.remove('open');
        cell.classList.add('open');
        panel.innerHTML = renderQuestionDetail(
          this.bank as Bank | null,
          question,
          this.spent[question.itemId],
        );
        const shut = screen.byId('qdetail-close');
        if (shut) shut.onclick = close;
      };
    }
  }

  /** Shows one of the modals rendered alongside the current screen. */
  private openNotice(id: string): void {
    const { screen } = this.deps;
    const modal = screen.byId(id);
    if (!modal) return;
    modal.dataset['open'] = 'true';
    const shut = (): void => {
      modal.dataset['open'] = 'false';
    };
    screen.byId(`${id}-close`)?.addEventListener('click', shut, { once: true });
    screen.byId(`${id}-scrim`)?.addEventListener('click', shut, { once: true });
  }

  private showResults(): void {
    const { screen, chrome, countdown, scoreAttempt } = this.deps;
    countdown.stop();
    this.deps.progress.clear();
    chrome.showTime(0, 0, false);
    chrome.showProgress(1);
    screen.onKey(null);

    const sitting = this.sitting;
    if (!sitting) return this.showSetup();

    void this.recordAttempt();
    const attempt = scoreAttempt.execute({
      sitting,
      responses: this.responses,
      spent: this.spent,
      essay: this.essay,
    });

    // The scoreboard first, then the full debrief behind a button: the shape of
    // the result before the question-by-question account of it.
    this.paint(renderSummary(attempt.score));
    const full = screen.byId('full');
    if (full) full.onclick = () => this.showFullResults(attempt.score);
  }

  private showFullResults(report: ScoreReport): void {
    const { screen, saver } = this.deps;
    this.paint(
      renderResults({
        report,
        // A sitting was built from it, so by now it is a validated bank.
        bank: this.bank as Bank | null,
        spent: this.spent,
        essay: this.essay,
        session: this.sessionName(),
        canSend: Boolean(this.deps.postEssay),
      }),
    );

    this.bindReview(report.detail);

    const again = screen.byId('again');
    if (again) again.onclick = () => this.showSetup();

    const post = screen.byId('send-essay');
    if (post) post.onclick = () => this.sendEssay();

    const essay = screen.byId('dl-essay');
    if (essay)
      essay.onclick = () =>
        saver.saveEssay(`${this.sessionName()}.docx`, {
          title: 'מטלת כתיבה',
          subtitle: this.sitting?.meta?.title ?? '',
          essay: this.essay,
        });

    const download = screen.byId('dl');
    if (download)
      download.onclick = () =>
        saver.save(`${this.sitting?.meta?.id ?? 'mapam'}-attempt.json`, {
          meta: this.sitting?.meta ?? {},
          responses: this.responses,
          spent: this.spent,
          essay: this.essay,
          score: report,
        });
  }

  /** Show a downloaded answers file the way the end of a sitting shows it.
   *
   *  The file carries its own marking — every question with what was given and
   *  what was right — so nothing is re-scored. What it does not carry is the
   *  booklet, and the review needs that for the chapter grid and the pictures,
   *  so the booklet is matched by name against the shelf. */
  private async viewAttempt(attempt: SavedAttempt): Promise<void> {
    const title = attempt.meta?.title ?? '';
    const stored = this.library.find((bank) => bank.title === title);

    if (stored && (this.bank as Bank | null)?.meta?.title !== title) {
      const account = this.deps.account;
      if (!account) return this.showSetup('אין חיבור לשרת, ולכן אין מהיכן לטעון את החוברת.');
      try {
        this.bank = await this.working(BUSY.opening, () => account.open(stored.id));
        this.bankId = stored.id;
      } catch {
        this.showSetup('לא ניתן לטעון את החוברת של התשובות האלה.');
        return;
      }
    }

    this.sitting = null;
    this.spent = attempt.spent ?? {};
    this.essay = attempt.essay ?? '';
    this.paint(renderSummary(attempt.score));
    const full = this.deps.screen.byId('full');
    if (full) full.onclick = () => this.showFullResults(attempt.score);
  }

  private rules() {
    return this.sitting?.rules ?? RULES;
  }
}

/** A downloaded answers file: the marking, and enough to name the booklet. */
interface SavedAttempt {
  meta?: { title?: string; session?: string };
  spent?: TimeSpent;
  essay?: string;
  score: ScoreReport;
}

/** The file, if it is a set of answers rather than a booklet. `score.detail` is
 *  what tells them apart — a bank has no marking in it. */
async function readAttempt(file: File): Promise<SavedAttempt | null> {
  if (!/\.json$/i.test(file.name)) return null;
  try {
    const parsed: unknown = JSON.parse(await file.text());
    const attempt = parsed as SavedAttempt;
    return Array.isArray(attempt?.score?.detail) ? attempt : null;
  } catch {
    return null;
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
    domains: ['verbal', 'quantitative', 'english'],
    uncapped: false,
  };
}
