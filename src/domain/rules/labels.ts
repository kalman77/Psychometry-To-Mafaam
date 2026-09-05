/* Human labels, for the UI and for reports. */

import type { ItemType, SittingDomain } from '../model/bank.ts';

export const DOMAIN_LABELS: Record<SittingDomain, string> = {
  writing: 'מטלת כתיבה',
  verbal: 'חשיבה מילולית',
  quantitative: 'חשיבה כמותית',
  english: 'אנגלית',
};

export const TYPE_LABELS: Record<ItemType, string> = {
  analogy: 'אנלוגיה',
  reading_passage: 'קטע קריאה',
  reading_question: 'שאלה על קטע קריאה',
  logic: 'שאלת הבנה והסקה',
  sentence_completion: 'השלמת משפטים',
  problem: 'שאלות ובעיות',
  figure: 'עיון בתרשים/טבלה',
  figure_question: 'שאלת הסקה מתרשים/טבלה',
  restatement: 'ניסוח מחדש',
};

/** Chapter ordinals, as printed on a NITE booklet. */
export const CHAPTER_ORDINALS = ['ראשון', 'שני', 'שלישי', 'רביעי'];

/* The versions a learner can pick between.
 *
 * A seed is any string as far as the builder is concerned — these are the ones
 * offered by name, so choosing a version is picking from a list rather than
 * inventing a value and wondering what it does. Each draws a different paper
 * from the same booklet: different questions, and a different number of them.
 *
 * The values are what reach the builder, so they are fixed for good — changing
 * one would quietly turn every saved and filed sitting of that version into a
 * different paper. */
export const VERSIONS: readonly { seed: string; label: string }[] = [
  { seed: 'a', label: 'גרסה א׳' },
  { seed: 'b', label: 'גרסה ב׳' },
  { seed: 'c', label: 'גרסה ג׳' },
  { seed: 'd', label: 'גרסה ד׳' },
  { seed: 'e', label: 'גרסה ה׳' },
  { seed: 'f', label: 'גרסה ו׳' },
  { seed: 'g', label: 'גרסה ז׳' },
  { seed: 'h', label: 'גרסה ח׳' },
];

/** What to call a seed that is not one of the offered versions — one typed in
 *  before this was a list, or set from the command line. */
export function versionLabel(seed: string): string {
  return VERSIONS.find((version) => version.seed === seed)?.label ?? `גרסה ${seed}`;
}

export function domainLabel(domain: string): string {
  return DOMAIN_LABELS[domain as SittingDomain] ?? domain;
}

export function typeLabel(type: string): string {
  return TYPE_LABELS[type as ItemType] ?? type;
}
