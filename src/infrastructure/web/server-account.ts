/* Browser adapter for the account endpoints the server exposes. */

import type { UnverifiedBank } from '../../domain/model/bank.ts';
import type {
  AccountGateway,
  FinishedAttempt,
  Identity,
  StoredBank,
} from '../../presentation/web/ports.ts';

async function get<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { 'x-mapam': '1' } });
  if (!response.ok) throw new Error(String(response.status));
  return (await response.json()) as T;
}

export class ServerAccount implements AccountGateway {
  async me(): Promise<Identity | null> {
    try {
      return await get<Identity>('/api/me');
    } catch {
      return null;
    }
  }

  async banks(): Promise<StoredBank[]> {
    try {
      return (await get<{ banks: StoredBank[] }>('/api/banks')).banks;
    } catch {
      return [];
    }
  }

  open(id: string): Promise<UnverifiedBank> {
    return get<UnverifiedBank>(`/api/banks/${encodeURIComponent(id)}`);
  }

  async record(attempt: FinishedAttempt): Promise<void> {
    await fetch('/api/attempts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-mapam': '1' },
      body: JSON.stringify(attempt),
    }).catch(() => undefined);
  }

  async forget(id: string): Promise<void> {
    await fetch(`/api/banks/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'x-mapam': '1' },
    });
  }
}
