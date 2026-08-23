/* Where a stimulus kind lives and what hangs off it. */

import type { Domain } from '../../model/bank/domain.ts';
import type { ItemType } from '../../model/bank/item-type.ts';

export interface StimulusSpec {
  domains: Domain[];
  /** The question type that hangs off this stimulus. */
  childType: ItemType;
}
