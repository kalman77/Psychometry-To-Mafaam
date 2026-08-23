/* One question on screen, with its passage and its place in the chapter. */

import type { ItemStep } from '../../../../domain/model/sitting/item-step.ts';
import type { StimulusStep } from '../../../../domain/model/sitting/stimulus-step.ts';

export interface ItemViewModel {
  step: ItemStep;
  /** The passage or table this question hangs off, if any. */
  stimulus: StimulusStep | null;
  /** 1-based position within its chapter, and the chapter's size. */
  position: number;
  of: number;
}
