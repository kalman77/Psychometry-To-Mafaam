/* Argument parsing for the CLI. Knows about flags, nothing else. */

export type CommandName = 'validate' | 'schedule' | 'json';

export interface CliRequest {
  command: CommandName;
  file: string;
  writingMinutes?: number;
  blueprint?: string;
  seed?: string;
  includeWriting: boolean;
}

export const USAGE = [
  'usage:',
  '  mapam validate <bank.json>',
  '  mapam schedule <bank.json> [--blueprint standard|half|full] [--seed a]',
  '                             [--writing 30|35|40|45] [--no-writing]',
  '  mapam json     <bank.json>',
].join('\n');

function isCommand(value: string | undefined): value is CommandName {
  return value === 'validate' || value === 'schedule' || value === 'json';
}

/** Returns null when the arguments don't name a command and a file. */
export function parseArgs(argv: string[]): CliRequest | null {
  const [command, file, ...rest] = argv;
  if (!isCommand(command) || !file) return null;

  const flag = (name: string): string | null => {
    const i = rest.indexOf(`--${name}`);
    return i > -1 ? (rest[i + 1] ?? null) : null;
  };

  const writing = flag('writing');
  const blueprint = flag('blueprint');
  const seed = flag('seed');

  return {
    command,
    file,
    ...(writing ? { writingMinutes: Number(writing) } : {}),
    ...(blueprint ? { blueprint } : {}),
    ...(seed ? { seed } : {}),
    includeWriting: !rest.includes('--no-writing'),
  };
}
