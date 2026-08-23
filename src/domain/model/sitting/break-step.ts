/* A major or micro break between chapters and domains. */

import type { BreakAfter } from './break-after.ts';
import type { StepBase } from './step-base.ts';

export interface BreakStep extends StepBase {
  kind: 'break';
  seconds: number;
  label: string;
  after: BreakAfter;
}
