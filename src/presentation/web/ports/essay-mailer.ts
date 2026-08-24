/* Sending the writing task to whoever checks it.
 *
 * The controller supplies the essay and what to call it; how it travels, who it
 * goes to and how many have gone before are the server's business. */

import type { EssayDocument } from './essay-document.ts';

export interface EssaySent {
  essaysSent: number;
  teacher: string;
}

export interface EssayMailer {
  send(filename: string, session: string, document: EssayDocument): Promise<EssaySent>;
}
