/* What an attempt produces once the sitting is over. */

import type { AnswerIndex, Domain, ItemType } from './bank.ts';

/** itemId -> chosen option, or null/absent when the clock ran out unanswered. */
export type Responses = Record<string, AnswerIndex | null | undefined>;

/** itemId -> seconds actually spent on it. */
export type TimeSpent = Record<string, number>;

export interface AnsweredItem {
  itemId: string;
  domain: Domain;
  type: ItemType;
  given: AnswerIndex | null;
  answer: AnswerIndex;
  correct: boolean;
  scored: boolean;
}

export type ByDomain<T> = Record<Domain, T>;

export interface Composites {
  multi: number;
  verbalEmphasis: number;
  quantEmphasis: number;
}

export interface ScoreReport {
  /** Correct answers among scored items. */
  raw: ByDomain<number>;
  /** Scored items presented. */
  attempted: ByDomain<number>;
  /** 50–150 uniform scale. */
  uniform: ByDomain<number>;
  composites: Composites;
  /** 200–800 estimates, one per composite. */
  general: Composites;
  detail: AnsweredItem[];
}
