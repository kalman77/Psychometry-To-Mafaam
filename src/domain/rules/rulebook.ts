/* The MAPAM rulebook.
 * Everything the format dictates lives here and nowhere else. Change a number
 * here and the schedule, the runner and the CLI all follow. */

import type { Domain, ItemType, SittingDomain } from '../model/bank.ts';

/** Seconds allotted per item type, per domain. A type absent from a domain
 *  does not exist in that domain — the validator leans on exactly that. */
export type TimeTable = Record<Domain, Partial<Record<ItemType, number>>>;

export interface WritingRules {
  defaultMinutes: number;
  /** 30 is standard; the longer values are approved accommodations. */
  allowedMinutes: number[];
  minLines: number;
}

export interface BreakRules {
  /** After the writing task, after verbal, after quantitative. */
  majorSeconds: number;
  /** Between chapters inside a domain. */
  microSeconds: number;
  /** "נבחנים המעוניינים לקצר את ההפסקה יוכלו לעשות זאת" */
  skippable: boolean;
}

export interface BehaviourRules {
  /** One shot per question, no returning. */
  allowBack: boolean;
  /** Answering early lets you move on. */
  allowEarlyAdvance: boolean;
  autoAdvanceOnTimeout: boolean;
  /** The passage/table stays on screen during its questions. */
  keepStimulusVisible: boolean;
}

export interface SessionRules {
  maxSeconds: number;
  typicalSeconds: number;
}

export interface Rulebook {
  time: TimeTable;
  writing: WritingRules;
  breaks: BreakRules;
  behaviour: BehaviourRules;
  domainOrder: SittingDomain[];
  session: SessionRules;
}

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

  // "לא תמיד אפשר להניח להיבחן במשך יותר מחמש שעות וחצי"
  session: { maxSeconds: 5.5 * 3600, typicalSeconds: 3.5 * 3600 },
};

/** Partial overrides an institution can hand to a build. */
export type RulebookOverrides = {
  [K in keyof Rulebook]?: Rulebook[K] extends object ? Partial<Rulebook[K]> : Rulebook[K];
};
