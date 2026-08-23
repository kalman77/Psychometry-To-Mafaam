/* The screen the runner paints on. */

import type { KeyHandler } from './key-handler.ts';

export interface Screen {
  render(html: string): void;
  byId<T extends HTMLElement>(id: string): T | null;
  all<T extends Element>(selector: string): T[];
  /** null clears the binding; a new handler replaces the old one. */
  onKey(handler: KeyHandler | null): void;
}
