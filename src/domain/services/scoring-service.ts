/* Scoring — raw -> uniform scale -> weighted composites -> estimated general.
 *
 * Two honest caveats, both inherited from the published tables: the estimate
 * assumes a full-length test answered throughout (a `half` sitting reads low),
 * and the writing task isn't scored — the booklet assumes it matches verbal. */

import type { AnswerIndex, Domain } from '../model/bank.ts';
import type { ByDomain, Composites, Responses, ScoreReport } from '../model/scoring.ts';
import type { Sitting } from '../model/sitting.ts';
import { GENERAL_BANDS, SCALE } from '../rules/scales.ts';

/** Raw correct answers -> the 50–150 uniform score for that domain. */
export function toUniform(domain: Domain, raw: number): number {
  const table = SCALE[domain];
  return table[Math.max(0, Math.min(table.length - 1, raw))]!;
}

/** The published table is banded on whole numbers, but a weighted score is
 *  fractional. Read each band as the continuous interval [lo, hi+1) and
 *  interpolate inside it, so nothing falls through the cracks. */
export function toGeneralScore(weighted: number): number {
  const w = Math.max(50, Math.min(150, weighted));
  for (const [lo, hi, generalLo, generalHi] of GENERAL_BANDS) {
    if (w > hi) continue;
    if (lo === hi) return generalLo;
    const t = Math.max(0, Math.min(1, (w - lo) / (hi + 1 - lo)));
    return Math.round(generalLo + t * (generalHi - generalLo));
  }
  return GENERAL_BANDS[GENERAL_BANDS.length - 1]![3];
}

export function score(sitting: Sitting, responses: Responses): ScoreReport {
  const raw: ByDomain<number> = { verbal: 0, quantitative: 0, english: 0 };
  const attempted: ByDomain<number> = { verbal: 0, quantitative: 0, english: 0 };
  const detail: ScoreReport['detail'] = [];

  for (const step of sitting.steps) {
    if (step.kind !== 'item') continue;
    const given: AnswerIndex | null = responses[step.itemId] ?? null;
    const correct = given === step.answer;

    if (step.scored) {
      attempted[step.domain]++;
      if (correct) raw[step.domain]++;
    }

    detail.push({
      itemId: step.itemId,
      domain: step.domain,
      type: step.type,
      given,
      answer: step.answer,
      correct,
      scored: step.scored,
    });
  }

  const V = toUniform('verbal', raw.verbal);
  const Q = toUniform('quantitative', raw.quantitative);
  const E = toUniform('english', raw.english);

  const composites: Composites = {
    multi: (2 * V + 2 * Q + E) / 5,
    verbalEmphasis: (3 * V + Q + E) / 5,
    quantEmphasis: (3 * Q + V + E) / 5,
  };

  return {
    raw,
    attempted,
    uniform: { verbal: V, quantitative: Q, english: E },
    composites,
    general: {
      multi: toGeneralScore(composites.multi),
      verbalEmphasis: toGeneralScore(composites.verbalEmphasis),
      quantEmphasis: toGeneralScore(composites.quantEmphasis),
    },
    detail,
  };
}
