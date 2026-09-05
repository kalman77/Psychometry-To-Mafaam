/* The MAPAM rulebook.
 * Everything the format dictates lives here and nowhere else. Change a number
 * here and the schedule, the runner and the CLI all follow.
 *
 * One type per file under ./rulebook/; this barrel re-exports them alongside
 * the numbers themselves. */

import type { Rulebook } from './rulebook/rulebook.ts';

export type { BehaviourRules } from './rulebook/behaviour-rules.ts';
export type { BreakRules } from './rulebook/break-rules.ts';
export type { Rulebook } from './rulebook/rulebook.ts';
export type { RulebookOverrides } from './rulebook/rulebook-overrides.ts';
export type { SessionRules } from './rulebook/session-rules.ts';
export type { TimeTable } from './rulebook/time-table.ts';
export type { WritingRules } from './rulebook/writing-rules.ts';

/** Source: NITE MAPAM time-per-question table. */
export const RULES: Rulebook = {
  time: {
    verbal: {
      analogy: 90, // אנלוגיה                        1.5 דק'
      reading_passage: 420, // קטע קריאה (זמן קריאה)            7 דק'
      reading_question: 240, // שאלה על קטע קריאה                4 דק'
      logic: 240, // שאלת הבנה והסקה                  4 דק'
      sentence_completion: 180, // השלמת משפטים                    3 דק'
    },
    quantitative: {
      problem: 240, // שאלות ובעיות                    4 דק'
      figure: 300, // עיון בתרשים/טבלה                5 דק'
      figure_question: 240, // שאלת הסקה מתרשים/טבלה            4 דק'
    },
    english: {
      sentence_completion: 120, // השלמת משפטים                    2 דק'
      reading_passage: 420, // קטע קריאה                       7 דק'
      reading_question: 240, // שאלה על קטע קריאה                4 דק'
      restatement: 240, // ניסוח מחדש                      4 דק'
    },
  },

  writing: { defaultMinutes: 30, allowedMinutes: [30, 35, 40, 45], minLines: 25 },

  breaks: {
    majorSeconds: 300, // 5 min
    microSeconds: 150, // 2.5 min
    skippable: true,
  },

  behaviour: {
    allowBack: false,
    allowEarlyAdvance: true,
    autoAdvanceOnTimeout: true,
    keepStimulusVisible: true,
  },

  domainOrder: ['writing', 'verbal', 'quantitative', 'english'],

  // NITE's own note is that a sitting should not be assumed to run past five
  // and a half hours. This practice format is longer than a real MAPAM — the
  // counts above are what was asked for — so the ceiling is set to hold them
  // at the longest writing task rather than trimming them to fit.
  session: { maxSeconds: 7 * 3600, typicalSeconds: 3.5 * 3600 },
};
