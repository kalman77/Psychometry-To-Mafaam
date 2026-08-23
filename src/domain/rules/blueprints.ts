/* How many items of each type a sitting draws from the bank.
 *
 * These counts are calibrated so the whole sitting lands on the 5.5-hour
 * ceiling — they are not published by NITE. Tune them per institution and the
 * rest of the system follows.
 *
 * One type per file under ./blueprints/; this barrel re-exports them
 * alongside the counts themselves. */

import type { Blueprint } from './blueprints/blueprint.ts';
import type { BlueprintName } from './blueprints/blueprint-name.ts';

export type { Blueprint } from './blueprints/blueprint.ts';
export type { BlueprintName } from './blueprints/blueprint-name.ts';
export type { DomainBlueprint } from './blueprints/domain-blueprint.ts';

/** `full` is null: take everything in the bank, in bank order, no sampling. */
export const BLUEPRINTS: Record<BlueprintName, Blueprint | null> = {
  // A real MAPAM sitting is three chapters, one per domain — not the eight of
  // the paper test. Each is shaped like a single printed chapter: the verbal
  // one carries a single passage, the English one carries two.
  standard: {
    verbal: {
      chapters: 1,
      analogy: 6,
      sentence_completion: 3,
      logic: 8,
      reading_passage: 1,
      reading_question: 6,
    },
    quantitative: { chapters: 1, problem: 16, figure: 1, figure_question: 4 },
    english: {
      chapters: 1,
      sentence_completion: 8,
      restatement: 4,
      reading_passage: 2,
      reading_question: 10,
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
