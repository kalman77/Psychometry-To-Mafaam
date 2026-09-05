/* One question on screen, with its passage.
 *
 * Deliberately without its number or its place in the chapter: a sitting draws
 * its questions out of the booklet's order, so a number on screen is one more
 * thing to read and nothing to act on. The rail across the top still shows how
 * far along the sitting is, and the review afterwards has the numbers. */

import type { ItemStep } from '../../../../domain/model/sitting/item-step.ts';
import type { StimulusStep } from '../../../../domain/model/sitting/stimulus-step.ts';

export interface ItemViewModel {
  step: ItemStep;
  /** The passage or table this question hangs off, if any. */
  stimulus: StimulusStep | null;
}
