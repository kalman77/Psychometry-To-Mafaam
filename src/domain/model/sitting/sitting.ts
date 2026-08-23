/* A bank, built: flat, timed, ordered, reproducible from its seed. */

import type { BankMeta } from '../bank/bank-meta.ts';
import type { Blueprint } from '../../rules/blueprints/blueprint.ts';
import type { Rulebook } from '../../rules/rulebook/rulebook.ts';
import type { SittingSummary } from './sitting-summary.ts';
import type { Step } from './step.ts';

export interface Sitting {
  meta: BankMeta;
  rules: Rulebook;
  blueprint: Blueprint | null;
  seed: string | null;
  steps: Step[];
  summary: SittingSummary;
}
