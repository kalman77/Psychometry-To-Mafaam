/* Handing the finished attempt back to the learner. */

import type { EssayDocument } from './essay-document.ts';

export interface FileSaver {
  save(filename: string, payload: unknown): void;
  /** The writing task as a document the learner can open and edit. */
  saveEssay(filename: string, document: EssayDocument): void;
}
