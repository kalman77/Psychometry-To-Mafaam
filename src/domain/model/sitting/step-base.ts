/* What every step carries. Not part of the public surface — the step
 * interfaces extend it, consumers use the `Step` union. */

import type { StepKind } from './step-kind.ts';

export interface StepBase {
  kind: StepKind;
  /** Position in the sitting; assigned as steps are pushed. */
  index: number;
  seconds?: number;
}
