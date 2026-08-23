/* Everything the build use case needs: a bank plus a few choices. */

import type { UnverifiedBank } from '../../../domain/model/bank/unverified-bank.ts';
import type { Blueprint } from '../../../domain/rules/blueprints/blueprint.ts';
import type { BlueprintName } from '../../../domain/rules/blueprints/blueprint-name.ts';
import type { RulebookOverrides } from '../../../domain/rules/rulebook/rulebook-overrides.ts';

export interface BuildSittingRequest {
  bank: UnverifiedBank;
  /** A blueprint name, a literal blueprint, or null/undefined for the whole bank. */
  blueprint?: BlueprintName | string | Blueprint | null;
  seed?: string | null;
  includeWriting?: boolean;
  writingMinutes?: number;
  chapters?: number;
  introSeconds?: number;
  rules?: RulebookOverrides;
}
