/* Collapsing a blueprint's ranges into the counts one sitting actually draws.
 *
 * Two properties this has to keep, because save/resume and server-side scoring
 * both rest on them:
 *
 *   - deterministic — the same seed must resolve to the same counts, or a
 *     resumed sitting would not be the sitting that was paused;
 *   - bank-independent — resolution reads nothing but the blueprint and the
 *     seed, so the counts can be recomputed later from the seed alone, with the
 *     booklet long gone.
 *
 * The second is why this runs before any sampling: it consumes the first draws
 * of the sequence, in a fixed order that does not depend on what is in the bank.
 *
 * The clock is the third constraint, and it is why the draw is followed by a
 * trim. A real booklet varies which questions it asks while staying the same
 * length; if every range came up high at once the sitting would run past the
 * ceiling. So the ranges are drawn freely and then walked back down — always
 * from whichever type is furthest above its own minimum — until the questions
 * fit the time they have. Composition varies; length does not.
 */

import type { Domain } from '../model/bank.ts';
import type { Blueprint, Count, DomainBlueprint } from '../rules/blueprints.ts';
import type { ResolvedBlueprint, ResolvedDomainBlueprint } from '../rules/blueprints.ts';
import type { Rulebook } from '../rules/rulebook.ts';
import { SCORED_DOMAINS } from '../rules/taxonomy.ts';
import { clone } from '../support/objects.ts';
import type { RandomSource } from './random.ts';

/** The least a count may be trimmed to: the bottom of its range, or the number
 *  itself when it was never a range to begin with. */
function floorOf(count: Count): number {
  return typeof count === 'number' ? count : count[0];
}

/** One count, drawn if it is a range. Inclusive of both ends. */
export function resolveCount(count: Count, random: RandomSource): number {
  if (typeof count === 'number') return count;
  const [min, max] = count;
  if (max <= min) return min;
  return min + Math.floor(random.next() * (max - min + 1));
}

export function resolveBlueprint(
  blueprint: Blueprint | null,
  random: RandomSource,
  /** Seconds the questions and their stimuli may take. Omitted, nothing is
   *  trimmed — the draw stands as it came out. */
  budget?: { seconds: number; rules: Rulebook },
): ResolvedBlueprint | null {
  if (!blueprint) return null;

  const resolved: ResolvedBlueprint = {};
  // A fixed order over domains and over the keys within one, so the draws line
  // up the same way every time.
  for (const domain of SCORED_DOMAINS) {
    const shape: DomainBlueprint | undefined = blueprint[domain];
    if (!shape) continue;

    const counts: Record<string, number> = {};
    for (const key of Object.keys(shape).sort()) {
      if (key === 'chapters') continue;
      const count = shape[key as keyof DomainBlueprint] as Count | undefined;
      if (count === undefined) continue;
      counts[key] = resolveCount(count, random);
    }
    resolved[domain] = { ...counts, chapters: shape.chapters } as ResolvedDomainBlueprint;
  }
  return budget ? trimToBudget(blueprint, resolved, budget.seconds, budget.rules) : resolved;
}

/** What one resolved blueprint's questions and stimuli would take. */
function projectSeconds(resolved: ResolvedBlueprint, rules: Rulebook): number {
  let total = 0;
  for (const domain of SCORED_DOMAINS) {
    const counts = resolved[domain];
    if (!counts) continue;
    const table = rules.time[domain];
    for (const [type, count] of Object.entries(counts))
      if (type !== 'chapters') total += (table[type as keyof typeof table] ?? 0) * count;
  }
  return total;
}

/** Walks the draw back down until it fits, taking one question at a time from
 *  whichever type has the most room above its own minimum. Ties break on the
 *  fixed domain and key order, so the result stays a function of the seed. */
function trimToBudget(
  blueprint: Blueprint,
  resolved: ResolvedBlueprint,
  seconds: number,
  rules: Rulebook,
): ResolvedBlueprint {
  // `clone`, not structuredClone: the runner is bundled into one page and has
  // to run wherever that page is opened, including where the global is absent.
  const trimmed: ResolvedBlueprint = clone(resolved);

  // Only a type that was written as a range may be trimmed: a fixed count is a
  // statement about the test, not slack to be taken up.
  const slack = (): { domain: Domain; type: string; room: number } | null => {
    let best: { domain: Domain; type: string; room: number } | null = null;
    for (const domain of SCORED_DOMAINS) {
      const shape = blueprint[domain];
      const counts = trimmed[domain];
      if (!shape || !counts) continue;
      for (const type of Object.keys(counts).sort()) {
        if (type === 'chapters') continue;
        const declared = shape[type as keyof DomainBlueprint] as Count | undefined;
        if (declared === undefined || typeof declared === 'number') continue;
        const room = (counts as unknown as Record<string, number>)[type]! - floorOf(declared);
        if (room > 0 && (!best || room > best.room)) best = { domain, type, room };
      }
    }
    return best;
  };

  while (projectSeconds(trimmed, rules) > seconds) {
    const take = slack();
    if (!take) break; // Already at every minimum; the caller's warning stands.
    (trimmed[take.domain] as unknown as Record<string, number>)[take.type]! -= 1;
  }
  return trimmed;
}
