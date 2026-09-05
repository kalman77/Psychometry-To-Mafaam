/* A bank, built: flat, timed, ordered, reproducible from its seed. */

import type { BankMeta } from '../bank/bank-meta.ts';
import type { ScaleTable } from '../bank/scale-table.ts';
import type { Blueprint } from '../../rules/blueprints/blueprint.ts';
import type { ResolvedBlueprint } from '../../rules/blueprints/resolved-blueprint.ts';
import type { Rulebook } from '../../rules/rulebook/rulebook.ts';
import type { SittingSummary } from './sitting-summary.ts';
import type { Step } from './step.ts';

export interface Sitting {
  meta: BankMeta;
  /** Carried through from the bank so scoring reads this booklet's table. */
  scale: ScaleTable | null;
  rules: Rulebook;
  blueprint: Blueprint | null;
  /** The blueprint with its ranges drawn, which is what this sitting used. */
  resolvedBlueprint: ResolvedBlueprint | null;
  seed: string | null;
  steps: Step[];
  summary: SittingSummary;
}
