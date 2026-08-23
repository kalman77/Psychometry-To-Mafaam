/* The smallest unit that must stay intact: either one standalone question, or
 * one stimulus plus the questions hanging off it. */

import type { Item } from '../../model/bank/item.ts';
import type { ItemType } from '../../model/bank/item-type.ts';
import type { Stimulus } from '../../model/bank/stimulus.ts';

export interface ItemGroup {
  kind: 'single' | 'stimulus';
  /** For a stimulus group this is its kind (reading_passage / figure);
   *  for a standalone question it is the item's type. */
  type: ItemType;
  stimulus: Stimulus | null;
  items: Item[];
  sectionId: string;
  seconds: number;
}
