/** Seconds allotted per item type, per domain. A type absent from a domain
 *  does not exist in that domain — the validator leans on exactly that. */

import type { Domain } from '../../model/bank/domain.ts';
import type { ItemType } from '../../model/bank/item-type.ts';

export type TimeTable = Record<Domain, Partial<Record<ItemType, number>>>;
