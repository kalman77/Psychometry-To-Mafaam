/* One question, on screen for exactly as long as the rulebook allows. */

import type { AnswerIndex } from '../bank/answer-index.ts';
import type { Direction } from '../bank/direction.ts';
import type { Domain } from '../bank/domain.ts';
import type { ItemType } from '../bank/item-type.ts';
import type { StepBase } from './step-base.ts';

export interface ItemStep extends StepBase {
  kind: 'item';
  domain: Domain;
  sectionId: string;
  itemId: string;
  type: ItemType;
  seconds: number;
  stem: string;
  instruction: string | null;
  options: string[];
  answer: AnswerIndex;
  stimulusId: string | null;
  image: string | null;
  dir: Direction | null;
  scored: boolean;
}
