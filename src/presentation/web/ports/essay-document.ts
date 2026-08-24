/* An essay, ready to be handed over as a document.
 *
 * Says nothing about the format on purpose: the controller knows it wants the
 * writing task saved, and the adapter decides that means .docx. */

export interface EssayDocument {
  title: string;
  /** Printed under the title — the booklet's own name. */
  subtitle?: string;
  essay: string;
}
