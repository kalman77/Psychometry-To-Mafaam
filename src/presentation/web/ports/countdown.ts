/* The clock behind every step. */

import type { CountdownHandlers } from './countdown-handlers.ts';

/** One clock at a time — starting a new countdown cancels the previous one. */
export interface Countdown {
  start(seconds: number, handlers: CountdownHandlers): void;
  stop(): void;
  /** Seconds left, 0 once expired or stopped. */
  remaining(): number;
  /** Seconds the current countdown started from. */
  total(): number;
}
