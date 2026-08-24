/* Browser adapter: a bank dropped on the page or picked from a file dialog. */

import type { UnverifiedBank } from '../../domain/model/bank.ts';
import type { BankFileReader, LoadedBank } from '../../presentation/web/ports.ts';

export class BrowserBankFileReader implements BankFileReader {
  read(file: File): Promise<LoadedBank> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('לא ניתן לקרוא את הקובץ.'));
      reader.onload = () => {
        try {
          resolve({ bank: JSON.parse(String(reader.result)) as UnverifiedBank });
        } catch (error) {
          reject(error as Error);
        }
      };
      reader.readAsText(file, 'utf-8');
    });
  }
}
