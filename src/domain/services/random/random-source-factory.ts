/* A seed in, a reproducible source out. */

import type { RandomSource } from './random-source.ts';

export type RandomSourceFactory = (seed?: string | null) => RandomSource;
