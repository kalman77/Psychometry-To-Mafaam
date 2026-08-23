/* The terminator: the sitting is over. */

import type { StepBase } from './step-base.ts';

export interface EndStep extends StepBase {
  kind: 'end';
}
