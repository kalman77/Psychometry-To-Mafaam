/* Browser adapter: a dropped file becomes a bank, sending PDFs to the server.
 *
 * A .json bank is still parsed locally, so the standalone offline runner keeps
 * working untouched; only a PDF needs the extractor on the other end. */

import type { UnverifiedBank } from '../../domain/model/bank.ts';
import type { BankFileReader, LoadedBank } from '../../presentation/web/ports.ts';
import { BrowserBankFileReader } from './file-bank-reader.ts';

const isPdf = (file: File): boolean =>
  file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

export class ServerBankFileReader implements BankFileReader {
  private readonly local = new BrowserBankFileReader();
  private readonly endpoint: string;

  constructor(endpoint = '/api/extract') {
    this.endpoint = endpoint;
  }

  async read(file: File): Promise<LoadedBank> {
    if (!isPdf(file)) return this.local.read(file);

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/pdf', 'x-mapam': '1' },
      body: file,
    });

    const payload = (await response.json().catch(() => null)) as
      | { bank?: UnverifiedBank; record?: { id: string }; error?: string }
      | null;

    if (!response.ok || !payload?.bank)
      throw new Error(payload?.error ?? `החילוץ נכשל (${response.status}).`);
    return payload.record
      ? { bank: payload.bank, storedId: payload.record.id }
      : { bank: payload.bank };
  }
}
