/* How many items of each type a sitting draws from the bank.
 *
 * `reading_passage` / `figure` count stimuli; `*_question` count the total
 * questions drawn across them. `chapters` is how many timed chapters the
 * domain is split into (micro-breaks go between them).
 *
 * These counts are calibrated so the whole sitting lands on the 5.5-hour
 * ceiling — they are not published by NITE. Tune them per institution and the
 * rest of the system follows. */

import type { Domain, ItemType } from '../model/bank.ts';

export interface DomainBlueprint extends Partial<Record<ItemType, number>> {
  chapters: number;
}

export type Blueprint = Partial<Record<Domain, DomainBlueprint>>;

export type BlueprintName = 'standard' | 'half' | 'full';

/** `full` is null: take everything in the bank, in bank order, no sampling. */
export const BLUEPRINTS: Record<BlueprintName, Blueprint | null> = {
  standard: {
    verbal: {
      chapters: 2,
      analogy: 6,
      sentence_completion: 5,
      logic: 7,
      reading_passage: 2,
      reading_question: 6,
    },
    quantitative: { chapters: 2, problem: 15, figure: 2, figure_question: 5 },
    english: {
      chapters: 2,
      sentence_completion: 10,
      restatement: 7,
      reading_passage: 2,
      reading_question: 7,
    },
  },

  // Half-length dry run: same proportions, roughly half the clock.
  half: {
    verbal: {
      chapters: 1,
      analogy: 3,
      sentence_completion: 3,
      logic: 4,
      reading_passage: 1,
      reading_question: 3,
    },
    quantitative: { chapters: 1, problem: 8, figure: 1, figure_question: 3 },
    english: {
      chapters: 1,
      sentence_completion: 5,
      restatement: 4,
      reading_passage: 1,
      reading_question: 4,
    },
  },

  full: null,
};

export function isBlueprintName(value: string): value is BlueprintName {
  return Object.prototype.hasOwnProperty.call(BLUEPRINTS, value);
}
