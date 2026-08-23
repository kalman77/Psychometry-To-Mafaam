/* What one domain of a bank actually holds. */

import type { ItemType } from '../../model/bank/item-type.ts';
import type { StimulusKind } from '../../model/bank/stimulus-kind.ts';

export interface DomainInventory {
  types: Partial<Record<ItemType, number>>;
  stimuli: Partial<Record<StimulusKind, number>>;
}
