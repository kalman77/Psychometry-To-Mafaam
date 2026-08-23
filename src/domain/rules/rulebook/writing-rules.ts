/* What the format dictates about the essay. */

export interface WritingRules {
  defaultMinutes: number;
  /** 30 is standard; the longer values are approved accommodations. */
  allowedMinutes: number[];
  minLines: number;
}
