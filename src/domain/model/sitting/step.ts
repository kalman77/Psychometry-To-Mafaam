/* Every screen the runner walks, discriminated by `kind`. */

import type { BreakStep } from './break-step.ts';
import type { EndStep } from './end-step.ts';
import type { ItemStep } from './item-step.ts';
import type { SectionIntroStep } from './section-intro-step.ts';
import type { StimulusStep } from './stimulus-step.ts';
import type { WritingStep } from './writing-step.ts';

export type Step =
  | WritingStep
  | BreakStep
  | SectionIntroStep
  | StimulusStep
  | ItemStep
  | EndStep;
