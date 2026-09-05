/* How many items of each type a sitting draws from the bank.
 *
 * `standard` follows the published historical counts for a MAPAM sitting:
 *
 *     analogies                 8-13     algebra              13-18
 *     sentence completion        6       geometry                5
 *     logic                      4       quantitative compare    6
 *     reading comprehension      5       chart/table             4
 *     English sentence compl.   8-17     English restatement     8
 *     English reading            5
 *
 * Two of those rows have no counterpart in the bank's taxonomy: algebra,
 * geometry and quantitative comparison are all `problem`, so they are summed,
 * and chart/table is `figure_question`.
 *
 * A range is written as a pair and drawn per sitting from the seed, so two runs
 * of the same booklet are not the same paper — one may ask eight analogies and
 * the next twelve, as the real thing does.
 *
 * The clock is what bounds those ranges. The published counts describe the
 * computerised adaptive test, which averages three and a half hours, while the
 * times in the rulebook are the accommodated paper ones, roughly twice as long
 * per question. The full published ranges would run past six hours at the top
 * of the draw, so each is capped where the longest sitting it can produce still
 * fits the 5.5-hour ceiling with a 30-minute writing task. The setup screen
 * reports the length before the sitting starts and warns when a longer writing
 * task pushes a particular draw over.
 *
 * One type per file under ./blueprints/; this barrel re-exports them
 * alongside the counts themselves. */

import type { Blueprint } from './blueprints/blueprint.ts';
import type { BlueprintName } from './blueprints/blueprint-name.ts';

export type { Blueprint } from './blueprints/blueprint.ts';
export type { BlueprintName } from './blueprints/blueprint-name.ts';
export type { Count } from './blueprints/count.ts';
export type { DomainBlueprint } from './blueprints/domain-blueprint.ts';
export type {
  ResolvedBlueprint,
  ResolvedDomainBlueprint,
} from './blueprints/resolved-blueprint.ts';

/** `full` is null: take everything in the bank, in bank order, no sampling. */
export const BLUEPRINTS: Record<BlueprintName, Blueprint | null> = {
  // A real MAPAM sitting is three chapters, one per domain — not the eight of
  // the paper test. Each is shaped like a single printed chapter: the verbal
  // one carries a single passage, the English one carries two.
  standard: {
    // Two halves per domain, so the micro-break falls in the middle of each.
    verbal: {
      chapters: 2,
      analogy: [10, 11],
      sentence_completion: 6,
      logic: 10,
      reading_passage: 1,
      reading_question: 5,
    },
    // algebra, geometry and quantitative comparison are all `problem` in the
    // booklet's own markings, so they are asked for as one number.
    quantitative: { chapters: 2, problem: [27, 28], figure: 1, figure_question: 4 },
    english: {
      chapters: 2,
      sentence_completion: 12,
      restatement: 8,
      reading_passage: 2,
      reading_question: 10,
    },
  },

  // Half-length dry run: same proportions, roughly half the clock.
  half: {
    verbal: {
      chapters: 1,
      analogy: [3, 5],
      sentence_completion: 3,
      logic: 2,
      reading_passage: 1,
      reading_question: 3,
    },
    quantitative: { chapters: 1, problem: [10, 14], figure: 1, figure_question: 2 },
    english: {
      chapters: 1,
      sentence_completion: [3, 5],
      restatement: 4,
      reading_passage: 1,
      reading_question: 3,
    },
  },

  full: null,
};

export function isBlueprintName(value: string): value is BlueprintName {
  return Object.prototype.hasOwnProperty.call(BLUEPRINTS, value);
}
