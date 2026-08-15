/* Browser adapter: hand the attempt back to the learner as a JSON download. */

import type { FileSaver } from '../../presentation/web/ports.ts';

export class JsonFileSaver implements FileSaver {
  save(filename: string, payload: unknown): void {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
}
