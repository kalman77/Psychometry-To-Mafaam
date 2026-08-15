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

export function domainLabel(domain: string): string {
  return DOMAIN_LABELS[domain as SittingDomain] ?? domain;
}

export function typeLabel(type: string): string {
  return TYPE_LABELS[type as ItemType] ?? type;
}
