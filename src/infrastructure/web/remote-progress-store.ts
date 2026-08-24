/* Progress kept on the server, so a sitting survives a different browser.
 *
 * ProgressStore is synchronous — the controller saves from inside a clock tick
 * and cannot await — so this keeps the local copy authoritative for reads and
 * mirrors every write upward. The browser you are sitting at answers instantly;
 * the one you move to picks the run up from the server on the way in.
 */

import type { ProgressStore, SavedProgress } from '../../presentation/web/ports.ts';
import { LocalProgressStore } from './local-progress-store.ts';

export class RemoteProgressStore implements ProgressStore {
  private readonly local = new LocalProgressStore();
  private inFlight: string | null = null;

  load(): SavedProgress | null {
    return this.local.load();
  }

  save(progress: SavedProgress): void {
    this.local.save(progress);
    if (!progress.bankId) return;
    const body = JSON.stringify(progress);
    // Skip an identical PUT: the heartbeat fires every few seconds and most of
    // those carry nothing new but a clock the server does not read.
    if (body === this.inFlight) return;
    this.inFlight = body;
    void fetch(`/api/progress/${encodeURIComponent(progress.bankId)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-mapam': '1' },
      body,
    }).catch(() => undefined);
  }

  clear(): void {
    const saved = this.local.load();
    this.local.clear();
    if (saved?.bankId)
      void fetch(`/api/progress/${encodeURIComponent(saved.bankId)}`, {
        method: 'DELETE',
        headers: { 'x-mapam': '1' },
      }).catch(() => undefined);
  }

  /** Pulls a run left on another browser into this one. */
  async adopt(bankId: string): Promise<SavedProgress | null> {
    try {
      const response = await fetch(`/api/progress/${encodeURIComponent(bankId)}`, {
        headers: { 'x-mapam': '1' },
      });
      if (!response.ok) return null;
      const remote = (await response.json()) as SavedProgress;
      const local = this.local.load();
      // Whichever is further along wins; the clock only ever runs down.
      if (local && local.bankId === bankId && local.savedAt >= remote.savedAt) return local;
      this.local.save(remote);
      return remote;
    } catch {
      return null;
    }
  }
}
