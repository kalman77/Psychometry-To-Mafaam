/* Everything the closing screen paints. */

import type { ScoreReport } from '../../../../domain/model/scoring/score-report.ts';
import type { TimeSpent } from '../../../../domain/model/scoring/time-spent.ts';

export interface ResultsViewModel {
  report: ScoreReport;
  spent: TimeSpent;
  essay: string;
  /** Names the .docx download; the booklet's sitting when it has one. */
  session: string;
  /** Whether a checker is reachable — false in the standalone runner. */
  canSend: boolean;
}
