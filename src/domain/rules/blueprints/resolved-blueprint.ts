/* A blueprint with every range collapsed to the number this sitting drew.
 *
 * Kept apart from `Blueprint` so the rest of the system cannot forget which it
 * is holding: a range is a plan, a resolved count is what happened. */

import type { Domain } from '../../model/bank/domain.ts';
import type { ItemType } from '../../model/bank/item-type.ts';

export interface ResolvedDomainBlueprint extends Partial<Record<ItemType, number>> {
  chapters: number;
}

export type ResolvedBlueprint = Partial<Record<Domain, ResolvedDomainBlueprint>>;
