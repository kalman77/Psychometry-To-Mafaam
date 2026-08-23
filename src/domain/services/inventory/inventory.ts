/* What the whole bank holds, domain by domain. */

import type { Domain } from '../../model/bank/domain.ts';
import type { DomainInventory } from './domain-inventory.ts';

export type Inventory = Partial<Record<Domain, DomainInventory>>;
