/* Somewhere a half-finished sitting survives the tab closing. */

import type { SavedProgress } from './saved-progress.ts';

export interface ProgressStore {
  /** The saved run, or null when there is none or it cannot be read. */
  load(): SavedProgress | null;
  save(progress: SavedProgress): void;
  clear(): void;
}
