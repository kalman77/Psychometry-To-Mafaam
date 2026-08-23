/* Everything the closing screen paints. */

import type { ScoreReport } from '../../../../domain/model/scoring/score-report.ts';
import type { TimeSpent } from '../../../../domain/model/scoring/time-spent.ts';

export interface ResultsViewModel {
  report: ScoreReport;
  spent: TimeSpent;
  essay: string;
}
