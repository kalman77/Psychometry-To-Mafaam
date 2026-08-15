/* The two ambient displays.
 *
 * The dial unwinds sage → sand → dusty rose and never turns alarm red: you can
 * see you're near the end without being startled at it. The rail fills across
 * the whole sitting, which is the number that actually settles nerves. */

import { formatDuration } from '../../domain/support/duration.ts';
import type { Chrome } from '../../presentation/web/ports.ts';

const RADIUS = 33;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Fractions of the clock left at which the dial warms, then cools to rose. */
const WARM_AT = 0.45;
const LATE_AT = 0.18;

export class DomChrome implements Chrome {
  private readonly dial: HTMLElement;
  private readonly arc: SVGCircleElement;
  private readonly clock: HTMLElement;
  private readonly rail: HTMLElement;

  constructor(
    dial: HTMLElement,
    arc: SVGCircleElement,
    clock: HTMLElement,
    rail: HTMLElement,
  ) {
    this.dial = dial;
    this.arc = arc;
    this.clock = clock;
    this.rail = rail;
    this.arc.style.strokeDasharray = String(CIRCUMFERENCE);
  }

  showTime(remaining: number, total: number, visible: boolean): void {
    this.dial.classList.toggle('hidden', !visible);
    if (!visible) return;

    const left = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
    this.arc.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - left));
    this.dial.classList.toggle('warm', left <= WARM_AT && left > LATE_AT);
    this.dial.classList.toggle('late', left <= LATE_AT);
    this.clock.textContent = formatDuration(remaining);
  }

  showProgress(fraction: number): void {
    this.rail.style.width = `${Math.min(100, Math.max(0, fraction * 100))}%`;
  }
}
