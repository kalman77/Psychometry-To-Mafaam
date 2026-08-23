/* One value per scored domain. */

import type { Domain } from '../bank/domain.ts';

export type ByDomain<T> = Record<Domain, T>;
