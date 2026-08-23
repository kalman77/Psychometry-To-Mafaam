/* Use case: turn a bank plus a few choices into a timed sitting.
 *
 * Validation, blueprint resolution and seeding happen here; the domain builder
 * below it only ever sees a valid bank and a resolved blueprint. */

import type { Bank } from '../../domain/model/bank.ts';
import type { Sitting } from '../../domain/model/sitting.ts';
import { InvalidBankError } from '../../domain/errors.ts';
import { BLUEPRINTS, isBlueprintName, type Blueprint } from '../../domain/rules/blueprints.ts';
import { validateBank } from '../../domain/services/bank-validator.ts';
import { buildSitting } from '../../domain/services/sitting-builder.ts';
import type { RandomSourceFactory } from '../ports/random.ts';
import type { BuildSittingRequest } from './build-sitting/build-sitting-request.ts';

export type { BuildSittingRequest } from './build-sitting/build-sitting-request.ts';

/** Names map to a table; anything else is taken literally. `full` is null. */
export function resolveBlueprint(
  blueprint: BuildSittingRequest['blueprint'],
): Blueprint | null {
  if (blueprint == null) return null;
  if (typeof blueprint === 'string')
    return isBlueprintName(blueprint) ? BLUEPRINTS[blueprint] : null;
  return blueprint;
}

export class BuildSittingUseCase {
  private readonly randomFactory: RandomSourceFactory;

  constructor(randomFactory: RandomSourceFactory) {
    this.randomFactory = randomFactory;
  }

  /** @throws InvalidBankError when the bank does not validate. */
  execute(request: BuildSittingRequest): Sitting {
    const problems = validateBank(request.bank);
    if (problems.length) throw new InvalidBankError(problems);

    return buildSitting(
      request.bank as Bank,
      {
        blueprint: resolveBlueprint(request.blueprint),
        seed: request.seed ?? null,
        ...(request.includeWriting === undefined ? {} : { includeWriting: request.includeWriting }),
        ...(request.writingMinutes === undefined ? {} : { writingMinutes: request.writingMinutes }),
        ...(request.chapters === undefined ? {} : { chapters: request.chapters }),
        ...(request.introSeconds === undefined ? {} : { introSeconds: request.introSeconds }),
        ...(request.rules === undefined ? {} : { rules: request.rules }),
      },
      this.randomFactory(request.seed),
    );
  }
}
