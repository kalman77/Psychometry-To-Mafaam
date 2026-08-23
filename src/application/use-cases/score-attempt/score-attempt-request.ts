/* A finished sitting and what the learner did with it. */

import type { Responses } from '../../../domain/model/scoring/responses.ts';
import type { TimeSpent } from '../../../domain/model/scoring/time-spent.ts';
import type { Sitting } from '../../../domain/model/sitting/sitting.ts';

export interface ScoreAttemptRequest {
  sitting: Sitting;
  responses: Responses;
  /** Optional; carried through to the downloadable attempt file. */
  spent?: TimeSpent;
  essay?: string;
}
