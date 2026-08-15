/* Two small helpers the rulebook merge needs. Nothing domain-specific. */

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Recursive merge of `patch` into `base`, arrays replaced wholesale.
 *  Mutates and returns `base`. */
export function deepMerge<T extends object>(base: T, patch: unknown): T {
  if (!isPlainObject(patch)) return base;
  const target = base as Record<string, unknown>;
  for (const key of Object.keys(patch)) {
    const next = patch[key];
    if (isPlainObject(next)) {
      const current = isPlainObject(target[key]) ? (target[key] as Record<string, unknown>) : {};
      target[key] = deepMerge(current, next);
    } else {
      target[key] = next;
    }
  }
  return base;
}
