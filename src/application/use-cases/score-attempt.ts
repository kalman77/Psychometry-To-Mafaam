/* Use case: what did this attempt come to? */

import type { Responses, ScoreReport, TimeSpent } from '../../domain/model/scoring.ts';
import type { Sitting } from '../../domain/model/sitting.ts';
import { score } from '../../domain/services/scoring-service.ts';

export interface ScoreAttemptRequest {
  sitting: Sitting;
  responses: Responses;
  /** Optional; carried through to the downloadable attempt file. */
  spent?: TimeSpent;
  essay?: string;
}

export interface Attempt {
  meta: Sitting['meta'];
  responses: Responses;
  spent: TimeSpent;
  essay: string;
  score: ScoreReport;
}

export class ScoreAttemptUseCase {
  execute(request: ScoreAttemptRequest): Attempt {
    return {
      meta: request.sitting.meta,
      responses: request.responses,
      spent: request.spent ?? {},
      essay: request.essay ?? '',
      score: score(request.sitting, request.responses),
    };
  }
}
