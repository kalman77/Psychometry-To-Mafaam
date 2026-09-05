/* A booklet's own raw-to-uniform conversion table, printed on its last pages.
 *
 * Indexed by raw score, valued in the 50–150 uniform scale, one array per
 * domain. NITE publishes a different one for every form, so a bank that
 * carries its own is scored on its own terms rather than on another sitting's. */

import type { Domain } from './domain.ts';

export type ScaleTable = Record<Domain, number[]>;
