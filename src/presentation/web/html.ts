/* Escaping and the two text shapes the runner renders. */

const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

/** Everything that reaches the page from a bank goes through this. */
export function esc(value: unknown): string {
  return String(value == null ? '' : value).replace(/[&<>"]/g, (c) => ENTITIES[c]!);
}

/** Blank lines become paragraphs, single newlines become breaks. */
export function paragraphs(text: string): string {
  return esc(text)
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export function isHebrew(text: string | null | undefined): boolean {
  return /[\u0590-\u05FF]/.test(text ?? '');
}

/** Direction an item or stimulus should be laid out in. */
export function directionOf(explicit: string | null, text: string): 'rtl' | 'ltr' {
  return (explicit as 'rtl' | 'ltr' | null) ?? (isHebrew(text) ? 'rtl' : 'ltr');
}

/** Drop a fragment only when the condition holds — keeps templates flat. */
export function when(condition: unknown, fragment: string): string {
  return condition ? fragment : '';
}
