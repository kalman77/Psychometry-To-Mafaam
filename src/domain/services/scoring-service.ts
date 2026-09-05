/* Scoring — raw -> uniform scale -> weighted composites -> estimated general.
 *
 * NITE publishes one conversion table per domain, indexed by raw score on a
 * full-length paper test — 46 verbal questions, 40 quantitative, 44 English. A
 * sitting is one chapter per domain and draws a varying number of questions
 * into it, so a raw score is first stretched onto the table's range: 24 right
 * out of 24 is a perfect paper and reads 150, not the 102 that "24" means on a
 * 46-question table. How many were asked is therefore part of the sum, and is
 * taken from the sitting rather than assumed.
 *
 * Two honest caveats: the stretch is linear, where a real short-form table
 * would be calibrated (NITE doesn't publish one, and a shorter test measures
 * less precisely at the extremes), and the writing task isn't scored — the
 * booklet assumes it matches verbal. */

import type { AnswerIndex, Domain, ScaleTable } from '../model/bank.ts';
import type { ByDomain, Composites, Responses, ScoreReport } from '../model/scoring.ts';
import type { Sitting } from '../model/sitting.ts';
import { GENERAL_BANDS, SCALE } from '../rules/scales.ts';

/** Raw correct answers -> the 50–150 uniform score for that domain.
 *
 *  `outOf` is how many scored questions the sitting actually asked. Without it
 *  a short sitting is read off the table as though the unasked questions had
 *  been got wrong, and cannot reach the top of the scale. */
export function toUniform(
  domain: Domain,
  raw: number,
  outOf?: number,
  scale: ScaleTable = SCALE,
): number {
  const table = scale[domain];
  const top = table.length - 1;
  const onTable = Math.max(0, Math.min(top, outOf && outOf > 0 ? (raw / outOf) * top : raw));

  // Read between the table's rows rather than snapping to one. A short sitting
  // lands between them — 23 right out of 24 is 44.1 rows along a 46-row table —
  // and rounding there throws away up to half a row, which is what made one
  // wrong answer cost more or less than the next for no reason the learner
  // could see. Interpolating keeps the steps even and the score unbiased.
  const below = Math.floor(onTable);
  const above = Math.min(top, below + 1);
  const across = onTable - below;
  return Math.round(table[below]! + across * (table[above]! - table[below]!));
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

  // The booklet's own table when it has one — the published conversion differs
  // from form to form, and scoring a 2025 paper off the 2023 table is worth
  // about twenty points at the middle of the scale.
  const scale = sitting.scale ?? SCALE;
  const V = toUniform('verbal', raw.verbal, attempted.verbal, scale);
  const Q = toUniform('quantitative', raw.quantitative, attempted.quantitative, scale);
  const E = toUniform('english', raw.english, attempted.english, scale);

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
