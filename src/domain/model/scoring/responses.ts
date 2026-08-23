/** itemId -> chosen option, or null/absent when the clock ran out unanswered. */

import type { AnswerIndex } from '../bank/answer-index.ts';

export type Responses = Record<string, AnswerIndex | null | undefined>;
