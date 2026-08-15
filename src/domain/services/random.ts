/* Selection needs randomness, but the domain must not reach for Math.random:
 * a sitting has to be reproducible from its seed. The domain states what it
 * needs; infrastructure supplies it. */

export interface RandomSource {
  /** Uniform in [0, 1). */
  next(): number;
}

export type RandomSourceFactory = (seed?: string | null) => RandomSource;

/** Fisher–Yates over a copy, then take the first `count`. */
export function sample<T>(pool: readonly T[], count: number, random: RandomSource): T[] {
  if (count >= pool.length) return pool.slice();
  const shuffled = pool.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random.next() * (i + 1));
    const swap = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = swap;
  }
  return shuffled.slice(0, count);
}
