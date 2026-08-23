/* Every kind of item a bank can hold, questions and stimuli alike. */

export type ItemType =
  | 'analogy'
  | 'sentence_completion'
  | 'logic'
  | 'reading_question'
  | 'problem'
  | 'figure'
  | 'figure_question'
  | 'restatement'
  | 'reading_passage';
