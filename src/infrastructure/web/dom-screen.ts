/* The <main> element the runner paints into, plus the single key binding the
 * current screen owns. */

import type { KeyHandler, Screen } from '../../presentation/web/ports.ts';

export class DomScreen implements Screen {
  private readonly root: HTMLElement;
  private readonly doc: Document;

  constructor(root: HTMLElement, doc: Document = document) {
    this.root = root;
    this.doc = doc;
  }

  render(html: string): void {
    this.onKey(null);
    this.root.innerHTML = `<div class="enter">${html}</div>`;
  }

  byId<T extends HTMLElement>(id: string): T | null {
    return this.doc.getElementById(id) as T | null;
  }

  all<T extends Element>(selector: string): T[] {
    return [...this.doc.querySelectorAll<T>(selector)];
  }

  onKey(handler: KeyHandler | null): void {
    this.doc.onkeydown = handler;
  }
}
