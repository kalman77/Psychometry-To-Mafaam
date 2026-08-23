/* Browser adapter: a half-finished sitting parked in localStorage.
 *
 * Every access is guarded — private mode, a full quota and a cleared origin all
 * present as throws, and none of them should take the exam down with them. */

import type { ProgressStore, SavedProgress } from '../../presentation/web/ports.ts';

const KEY = 'mapam.progress.v1';

export class LocalProgressStore implements ProgressStore {
  load(): SavedProgress | null {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SavedProgress;
      return typeof parsed?.fingerprint === 'string' ? parsed : null;
    } catch {
      return null;
    }
  }

  save(progress: SavedProgress): void {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(progress));
    } catch {
      /* Out of quota or storage disabled: the sitting carries on regardless. */
    }
  }

  clear(): void {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* nothing to do */
    }
  }
}
