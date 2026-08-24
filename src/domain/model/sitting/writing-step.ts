/* The essay screen that opens a sitting. */

import type { StepBase } from './step-base.ts';

export interface WritingStep extends StepBase {
  kind: 'writing';
  domain: 'writing';
  seconds: number;
  prompt: string;
  intro: string | null;
  minLines: number;
  image: string | null;
  /** What has been written so far. Empty on a fresh sitting; refilled when a
   *  half-written essay is resumed. */
  essay: string;
  /** Whether a checker is reachable — false in the standalone runner. */
  canSend: boolean;
}
