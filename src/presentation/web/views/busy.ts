/* The overlay that says work is happening.
 *
 * Extracting a booklet runs poppler and python over a few megabytes, which is
 * seconds of nothing on screen; opening or deleting a stored one is a round
 * trip. Rendered with every screen and toggled by `data-open`, the same way the
 * notice modal is — the Screen port replaces a screen wholesale, so anything
 * that has to appear later must already be in the markup. */

export function renderBusy(): string {
  return `
  <div class="busy" id="busy" data-open="false" role="status" aria-live="polite">
    <div class="busy-scrim"></div>
    <div class="busy-card">
      <div class="busy-spinner" aria-hidden="true"></div>
      <p class="busy-label" id="busy-label"></p>
    </div>
  </div>`;
}

/** What each slow job calls itself while it runs. */
export const BUSY = {
  extracting: 'מחלץ את החוברת… זה עשוי לקחת דקה',
  opening: 'טוען את החוברת…',
  forgetting: 'מוחק את החוברת…',
} as const;

/* Not here on purpose: pulling the account and the library, and filing a
 * finished sitting. All three are fired and forgotten on a screen that already
 * works without them, so covering it would be a block with nothing to wait for
 * — and over the results it would be the very wait that code avoids. */
