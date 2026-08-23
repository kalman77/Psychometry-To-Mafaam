/* The randomness the domain asks for; infrastructure supplies it. */

export interface RandomSource {
  /** Uniform in [0, 1). */
  next(): number;
}
