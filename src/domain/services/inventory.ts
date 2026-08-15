/* What does the bank actually contain? Feeds the blueprint UI and the
 * "you asked for 8 but only have 5" warnings. */

import type { Bank, Domain, ItemType, StimulusKind } from '../model/bank.ts';
import { DEFAULT_STIMULUS_KIND } from '../rules/taxonomy.ts';

export interface DomainInventory {
  types: Partial<Record<ItemType, number>>;
  stimuli: Partial<Record<StimulusKind, number>>;
}

export type Inventory = Partial<Record<Domain, DomainInventory>>;

export function inventory(bank: Bank): Inventory {
  const inv: Inventory = {};

  for (const section of bank.sections ?? []) {
    const entry: DomainInventory = inv[section.domain] ?? { types: {}, stimuli: {} };

    for (const stimulus of section.stimuli ?? []) {
      const kind = stimulus.kind ?? DEFAULT_STIMULUS_KIND;
      entry.stimuli[kind] = (entry.stimuli[kind] ?? 0) + 1;
    }
    for (const item of section.items ?? [])
      entry.types[item.type] = (entry.types[item.type] ?? 0) + 1;

    inv[section.domain] = entry;
  }

  return inv;
}
