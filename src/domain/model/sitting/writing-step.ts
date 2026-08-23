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
}
