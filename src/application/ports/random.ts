/* Randomness as a dependency, so a seed always yields the same sitting.
 * Declared by the domain, re-exported here as the port use cases inject. */

export type { RandomSource, RandomSourceFactory } from '../../domain/services/random.ts';
