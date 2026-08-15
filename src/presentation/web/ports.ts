/* What the runner needs from the browser, stated as interfaces so the
 * controller can be driven by a test double instead of a real page. */

import type { UnverifiedBank } from '../../domain/model/bank.ts';

export interface CountdownHandlers {
  onTick(remaining: number, total: number): void;
  onExpire(): void;
}

/** One clock at a time — starting a new countdown cancels the previous one. */
export interface Countdown {
  start(seconds: number, handlers: CountdownHandlers): void;
  stop(): void;
  /** Seconds left, 0 once expired or stopped. */
  remaining(): number;
  /** Seconds the current countdown started from. */
  total(): number;
}

export type KeyHandler = (event: KeyboardEvent) => void;

/** The screen the runner paints on. */
export interface Screen {
  render(html: string): void;
  byId<T extends HTMLElement>(id: string): T | null;
  all<T extends Element>(selector: string): T[];
  /** null clears the binding; a new handler replaces the old one. */
  onKey(handler: KeyHandler | null): void;
}

/** The time dial in the corner and the journey rail across the top. */
export interface Chrome {
  /** `visible` hides the dial without stopping the clock (breaks do this). */
  showTime(remaining: number, total: number, visible: boolean): void;
  /** 0–1 across the whole sitting. */
  showProgress(fraction: number): void;
}

export interface BankFileReader {
  read(file: File): Promise<UnverifiedBank>;
}

export interface FileSaver {
  save(filename: string, payload: unknown): void;
}
