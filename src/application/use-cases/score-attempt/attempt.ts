/* The downloadable record of one attempt. */

import type { Responses } from '../../../domain/model/scoring/responses.ts';
import type { ScoreReport } from '../../../domain/model/scoring/score-report.ts';
import type { TimeSpent } from '../../../domain/model/scoring/time-spent.ts';
import type { Sitting } from '../../../domain/model/sitting/sitting.ts';

export interface Attempt {
  meta: Sitting['meta'];
  responses: Responses;
  spent: TimeSpent;
  essay: string;
  score: ScoreReport;
}
