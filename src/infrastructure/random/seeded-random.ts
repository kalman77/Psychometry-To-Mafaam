/* Deterministic PRNG so a given seed always yields the same sitting:
 * FNV-1a over the seed string, then xorshift32. */

import type { RandomSource, RandomSourceFactory } from '../../domain/services/random.ts';

export function seededRandom(seed?: string | null): RandomSource {
  const text = String(seed == null ? 'mapam' : seed);
  let state = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    state ^= text.charCodeAt(i);
    state = Math.imul(state, 16777619) >>> 0;
  }
  return {
    next(): number {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      return state / 4294967296;
    },
  };
}

export const seededRandomFactory: RandomSourceFactory = seededRandom;
