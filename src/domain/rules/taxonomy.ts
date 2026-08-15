/* Which types exist where, in what order, and which ones hang off a stimulus. */

import type { Domain, ItemType, StimulusKind } from '../model/bank.ts';

/** Order the item types appear in within a chapter, per domain. */
export const TYPE_ORDER: Record<Domain, ItemType[]> = {
  verbal: ['analogy', 'sentence_completion', 'logic', 'reading_passage'],
  quantitative: ['problem', 'figure'],
  english: ['sentence_completion', 'restatement', 'reading_passage'],
};

export interface StimulusSpec {
  domains: Domain[];
  /** The question type that hangs off this stimulus. */
  childType: ItemType;
}

export const STIMULUS_TYPES: Record<StimulusKind, StimulusSpec> = {
  reading_passage: { domains: ['verbal', 'english'], childType: 'reading_question' },
  figure: { domains: ['quantitative'], childType: 'figure_question' },
};

export const DEFAULT_STIMULUS_KIND: StimulusKind = 'reading_passage';

export function stimulusSpec(kind: string): StimulusSpec | null {
  return Object.prototype.hasOwnProperty.call(STIMULUS_TYPES, kind)
    ? STIMULUS_TYPES[kind as StimulusKind]
    : null;
}

/** A question of this type is meaningless without its passage or table. */
export function requiresStimulus(type: ItemType): boolean {
  return type === 'reading_question' || type === 'figure_question';
}
