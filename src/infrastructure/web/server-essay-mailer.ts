/* Browser adapter: posts the essay, already a .docx, to the server to send. */

import type { EssayDocument, EssayMailer, EssaySent } from '../../presentation/web/ports.ts';
import { essayDocx } from './docx.ts';

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  // Chunked: spreading a few hundred KB into String.fromCharCode at once
  // overflows the argument list.
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export class ServerEssayMailer implements EssayMailer {
  async send(filename: string, session: string, document: EssayDocument): Promise<EssaySent> {
    const response = await fetch('/api/essay/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-mapam': '1' },
      body: JSON.stringify({
        session,
        filename,
        docx: await toBase64(essayDocx(document)),
      }),
    });
    const payload = (await response.json().catch(() => null)) as
      | (EssaySent & { error?: string })
      | null;
    if (!response.ok || !payload) throw new Error(payload?.error ?? 'השליחה נכשלה.');
    return payload;
  }
}
