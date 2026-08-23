/* How long the sitting pauses, and where. */

export interface BreakRules {
  /** After the writing task, after verbal, after quantitative. */
  majorSeconds: number;
  /** Between chapters inside a domain. */
  microSeconds: number;
  /** "נבחנים המעוניינים לקצר את ההפסקה יוכלו לעשות זאת" */
  skippable: boolean;
}
