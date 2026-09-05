/* How many of one item type a sitting draws.
 *
 * A plain number is exactly that many. A pair is an inclusive range, drawn per
 * sitting from the seed — a real booklet does not carry the same eight
 * analogies every time, and neither should a practice one. */

export type Count = number | readonly [min: number, max: number];
