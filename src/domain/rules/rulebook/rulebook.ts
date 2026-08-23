/* The MAPAM rulebook: everything the format dictates, in one shape. */

import type { SittingDomain } from '../../model/bank/sitting-domain.ts';
import type { BehaviourRules } from './behaviour-rules.ts';
import type { BreakRules } from './break-rules.ts';
import type { SessionRules } from './session-rules.ts';
import type { TimeTable } from './time-table.ts';
import type { WritingRules } from './writing-rules.ts';

export interface Rulebook {
  time: TimeTable;
  writing: WritingRules;
  breaks: BreakRules;
  behaviour: BehaviourRules;
  domainOrder: SittingDomain[];
  session: SessionRules;
}
