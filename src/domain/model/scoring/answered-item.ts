/* One question as it came out of an attempt. */

import type { AnswerIndex } from '../bank/answer-index.ts';
import type { Domain } from '../bank/domain.ts';
import type { ItemType } from '../bank/item-type.ts';

export interface AnsweredItem {
  itemId: string;
  domain: Domain;
  type: ItemType;
  given: AnswerIndex | null;
  answer: AnswerIndex;
  correct: boolean;
  scored: boolean;
}
