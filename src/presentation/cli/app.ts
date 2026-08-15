/* CLI composition root: wire the adapters, run one command, pick an exit code. */

import { BuildSittingUseCase } from '../../application/use-cases/build-sitting.ts';
import { ValidateBankUseCase } from '../../application/use-cases/validate-bank.ts';
import { FileBankRepository } from '../../infrastructure/persistence/file-bank-repository.ts';
import { seededRandomFactory } from '../../infrastructure/random/seeded-random.ts';
import { parseArgs, USAGE, type CliRequest } from './args.ts';
import { renderSchedule } from './views/schedule-view.ts';
import { renderValidation } from './views/validate-view.ts';

export async function run(argv: string[]): Promise<number> {
  const request = parseArgs(argv);
  if (!request) {
    console.log(USAGE);
    return 1;
  }

  const banks = new FileBankRepository();
  const bank = await banks.load(request.file);

  const validation = new ValidateBankUseCase().execute(bank);

  if (request.command === 'validate') {
    console.log(renderValidation(validation));
    return validation.valid ? 0 : 1;
  }

  if (!validation.valid) {
    console.error(`Bank is invalid. Run: mapam validate ${request.file}`);
    return 1;
  }

  const sitting = new BuildSittingUseCase(seededRandomFactory).execute(toBuildRequest(bank, request));

  console.log(
    request.command === 'json' ? JSON.stringify(sitting, null, 2) : renderSchedule(sitting),
  );
  return 0;
}

function toBuildRequest(bank: unknown, request: CliRequest) {
  return {
    bank,
    ...(request.blueprint ? { blueprint: request.blueprint } : {}),
    ...(request.seed ? { seed: request.seed } : {}),
    ...(request.writingMinutes ? { writingMinutes: request.writingMinutes } : {}),
    includeWriting: request.includeWriting,
  };
}
