/* One parsed command line. */

import type { CommandName } from './command-name.ts';

export interface CliRequest {
  command: CommandName;
  file: string;
  writingMinutes?: number;
  blueprint?: string;
  seed?: string;
  includeWriting: boolean;
}
