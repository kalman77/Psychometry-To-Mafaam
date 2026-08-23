/* How many items of each type a sitting draws from the bank, per domain. */

import type { Domain } from '../../model/bank/domain.ts';
import type { DomainBlueprint } from './domain-blueprint.ts';

export type Blueprint = Partial<Record<Domain, DomainBlueprint>>;
