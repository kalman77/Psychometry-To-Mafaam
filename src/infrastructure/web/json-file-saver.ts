/* Browser adapter: hand the attempt back to the learner as a JSON download. */

import type { EssayDocument, FileSaver } from '../../presentation/web/ports.ts';
import { essayDocx } from './docx.ts';

export class JsonFileSaver implements FileSaver {
  save(filename: string, payload: unknown): void {
    this.saveBlob(
      filename,
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    );
  }

  saveEssay(filename: string, document: EssayDocument): void {
    this.saveBlob(filename, essayDocx(document));
  }

  private saveBlob(filename: string, blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    // Revoked on the next tick: Chrome has not started reading the blob yet
    // when click() returns, and pulling the URL out immediately truncates the
    // download to nothing.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
