/* The input format: a psychometric test expressed as a bank of items.
 * Mirrors schema/bank.schema.json. Nothing here knows how a sitting is built. */

export type Domain = 'verbal' | 'quantitative' | 'english';

/** Every domain in a sitting, including the writing task (which has no items). */
export type SittingDomain = Domain | 'writing';

export type ItemType =
  | 'analogy'
  | 'sentence_completion'
  | 'logic'
  | 'reading_question'
  | 'problem'
  | 'figure'
  | 'figure_question'
  | 'restatement'
  | 'reading_passage';

export type StimulusKind = 'reading_passage' | 'figure';

export type Direction = 'rtl' | 'ltr';

/** 1–4; a bank read off disk may carry anything, so validation still checks. */
export type AnswerIndex = 1 | 2 | 3 | 4;

export interface BankMeta {
  id?: string;
  title?: string;
  language?: string;
  source?: string;
  note?: string;
}

export interface WritingTask {
  prompt: string;
  intro?: string;
  minutes?: number;
  minLines?: number;
}

export interface Stimulus {
  id: string;
  kind?: StimulusKind;
  title?: string;
  /** Plain text. Blank lines become paragraphs. */
  body?: string;
  /** Trusted HTML, for tables. Rendered before body. */
  html?: string;
  /** URL or data: URI, for scanned figures. */
  image?: string;
  dir?: Direction;
  /** Overrides the reading time for this stimulus only. */
  seconds?: number;
}

export interface Item {
  id: string;
  type: ItemType;
  stem: string;
  instruction?: string;
  options: string[];
  answer: AnswerIndex;
  /** Required for reading_question and figure_question. */
  stimulusId?: string;
  image?: string;
  dir?: Direction;
  /** Overrides this item's time allowance. */
  seconds?: number;
  /** false = הפריט אינו נכלל בחישוב הציון */
  scored?: boolean;
}

export interface Section {
  id: string;
  domain: Domain;
  title?: string;
  subtitle?: string;
  stimuli?: Stimulus[];
  items: Item[];
}

export interface Bank {
  meta?: BankMeta;
  writingTask?: WritingTask;
  sections: Section[];
}

/** A bank as it arrives from disk, a drop zone or the network: shape unproven. */
export type UnverifiedBank = unknown;
