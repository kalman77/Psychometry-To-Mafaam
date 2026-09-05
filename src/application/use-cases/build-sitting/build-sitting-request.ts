/* Everything the build use case needs: a bank plus a few choices. */

import type { Domain } from '../../../domain/model/bank/domain.ts';
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
  /** Which domains to sit. Omitted, every domain the bank has. */
  domains?: Domain[];
  /** Let the sitting run past the session ceiling instead of trimming the
   *  blueprint's ranges to fit it. */
  uncapped?: boolean;
  rules?: RulebookOverrides;
}
