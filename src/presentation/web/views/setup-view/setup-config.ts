/* The choices the opening screen collects. */

export interface SetupConfig {
  writingMinutes: number;
  /** Blueprint name as chosen in the UI — 'full' means the whole bank. */
  blueprint: string;
  seed: string;
  includeWriting: boolean;
}
