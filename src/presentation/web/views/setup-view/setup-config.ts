/* The choices the opening screen collects. */

import type { Domain } from '../../../../domain/model/bank/domain.ts';

export interface SetupConfig {
  writingMinutes: number;
  /** Blueprint name as chosen in the UI — 'full' means the whole bank. */
  blueprint: string;
  seed: string;
  includeWriting: boolean;
  /** Which domains to sit. Part of the config for the same reason the rest of
   *  it is: it decides what the sitting contains. */
  domains: Domain[];
  /** Let the sitting run past the 5.5-hour ceiling instead of trimming the
   *  blueprint's ranges to fit it. Part of the config, so it is saved with a
   *  paused run and sent with a finished one — it changes how many questions
   *  are drawn, and a sitting has to rebuild identically from what is stored. */
  uncapped: boolean;
}
