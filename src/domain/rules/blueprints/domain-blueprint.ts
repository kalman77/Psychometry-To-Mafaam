/* How many items of each type one domain draws.
 *
 * `reading_passage` / `figure` count stimuli; `*_question` count the total
 * questions drawn across them. `chapters` is how many timed chapters the
 * domain is split into (micro-breaks go between them). */

import type { ItemType } from '../../model/bank/item-type.ts';

export interface DomainBlueprint extends Partial<Record<ItemType, number>> {
  chapters: number;
}
