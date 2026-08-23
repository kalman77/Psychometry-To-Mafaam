/* Use case: what did this attempt come to? */

import { score } from '../../domain/services/scoring-service.ts';
import type { Attempt } from './score-attempt/attempt.ts';
import type { ScoreAttemptRequest } from './score-attempt/score-attempt-request.ts';

export type { Attempt } from './score-attempt/attempt.ts';
export type { ScoreAttemptRequest } from './score-attempt/score-attempt-request.ts';

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
