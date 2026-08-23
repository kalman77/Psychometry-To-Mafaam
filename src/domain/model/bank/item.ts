/* One multiple-choice question. */

import type { AnswerIndex } from './answer-index.ts';
import type { Direction } from './direction.ts';
import type { ItemType } from './item-type.ts';

export interface Item {
  id: string;
  type: ItemType;
  stem: string;
  instruction?: string;
  options: string[];
  answer: AnswerIndex;
  /** Required for reading_question and figure_question. */
  stimulusId?: string;
  image?: string;
  dir?: Direction;
  /** Overrides this item's time allowance. */
  seconds?: number;
  /** false = הפריט אינו נכלל בחישוב הציון */
  scored?: boolean;
}
