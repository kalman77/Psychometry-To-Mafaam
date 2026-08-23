/* The time dial in the corner and the journey rail across the top. */

export interface Chrome {
  /** `visible` hides the dial without stopping the clock (breaks do this). */
  showTime(remaining: number, total: number, visible: boolean): void;
  /** 0–1 across the whole sitting. */
  showProgress(fraction: number): void;
}
