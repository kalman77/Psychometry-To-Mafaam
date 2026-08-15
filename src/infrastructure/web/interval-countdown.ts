/* A countdown driven by wall-clock time, not by tick counting: a throttled
 * background tab must not hand the learner extra seconds. */

import type { Countdown, CountdownHandlers } from '../../presentation/web/ports.ts';

const TICK_MS = 100;

export class IntervalCountdown implements Countdown {
  private handle: ReturnType<typeof setInterval> | null = null;
  private deadline = 0;
  private seconds = 0;

  stop(): void {
    if (this.handle) clearInterval(this.handle);
    this.handle = null;
  }

  start(seconds: number, handlers: CountdownHandlers): void {
    this.stop();
    this.seconds = seconds;
    this.deadline = Date.now() + seconds * 1000;

    this.handle = setInterval(() => {
      const left = this.remaining();
      handlers.onTick(left, this.seconds);
      if (left <= 0) {
        this.stop();
        handlers.onExpire();
      }
    }, TICK_MS);
  }

  remaining(): number {
    return Math.max(0, (this.deadline - Date.now()) / 1000);
  }

  total(): number {
    return this.seconds;
  }
}
