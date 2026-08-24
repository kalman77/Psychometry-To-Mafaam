/* What the runner needs from the browser, stated as interfaces so the
 * controller can be driven by a test double instead of a real page.
 *
 * One type per file under ./ports/; this barrel is the import surface. */

export type { AccountGateway, Identity } from './ports/account-gateway.ts';
export type { BankFileReader } from './ports/bank-file-reader.ts';
export type { Chrome } from './ports/chrome.ts';
export type { Countdown } from './ports/countdown.ts';
export type { CountdownHandlers } from './ports/countdown-handlers.ts';
export type { FileSaver } from './ports/file-saver.ts';
export type { KeyHandler } from './ports/key-handler.ts';
export type { ProgressStore } from './ports/progress-store.ts';
export type { SavedProgress } from './ports/saved-progress.ts';
export type { Screen } from './ports/screen.ts';
export type { StoredBank } from './ports/stored-bank.ts';
