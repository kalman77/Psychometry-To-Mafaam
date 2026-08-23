/* Reading time for a passage, table or figure, before its questions. */

import type { Direction } from '../bank/direction.ts';
import type { Domain } from '../bank/domain.ts';
import type { StimulusKind } from '../bank/stimulus-kind.ts';
import type { StepBase } from './step-base.ts';

export interface StimulusStep extends StepBase {
  kind: 'stimulus';
  domain: Domain;
  sectionId: string;
  stimulusId: string;
  stimulusKind: StimulusKind;
  seconds: number;
  title: string;
  body: string | null;
  html: string | null;
  image: string | null;
  dir: Direction | null;
}
