/* The output format: a flat, timed, ordered list of steps the runner walks. */

import type {
  AnswerIndex,
  BankMeta,
  Direction,
  Domain,
  ItemType,
  SittingDomain,
  StimulusKind,
} from './bank.ts';
import type { Blueprint } from '../rules/blueprints.ts';
import type { Rulebook } from '../rules/rulebook.ts';

export type StepKind = 'writing' | 'break' | 'section-intro' | 'stimulus' | 'item' | 'end';

interface StepBase {
  kind: StepKind;
  /** Position in the sitting; assigned as steps are pushed. */
  index: number;
  seconds?: number;
}

export interface WritingStep extends StepBase {
  kind: 'writing';
  domain: 'writing';
  seconds: number;
  prompt: string;
  intro: string | null;
  minLines: number;
}

/** What the break follows — drives nothing but the label in reports. */
export type BreakAfter = 'writing' | 'chapter' | 'domain';

export interface BreakStep extends StepBase {
  kind: 'break';
  seconds: number;
  label: string;
  after: BreakAfter;
}

export interface SectionIntroStep extends StepBase {
  kind: 'section-intro';
  domain: Domain;
  sectionId: string;
  title: string;
  subtitle: string;
  itemCount: number;
  seconds: number;
}

export interface StimulusStep extends StepBase {
  kind: 'stimulus';
  domain: Domain;
  sectionId: string;
  stimulusId: string;
  stimulusKind: StimulusKind;
  seconds: number;
  title: string;
  body: string | null;
  html: string | null;
  image: string | null;
  dir: Direction | null;
}

export interface ItemStep extends StepBase {
  kind: 'item';
  domain: Domain;
  sectionId: string;
  itemId: string;
  type: ItemType;
  seconds: number;
  stem: string;
  instruction: string | null;
  options: string[];
  answer: AnswerIndex;
  stimulusId: string | null;
  image: string | null;
  dir: Direction | null;
  scored: boolean;
}

export interface EndStep extends StepBase {
  kind: 'end';
}

export type Step =
  | WritingStep
  | BreakStep
  | SectionIntroStep
  | StimulusStep
  | ItemStep
  | EndStep;

export interface DomainSummary {
  seconds: number;
  items: number;
}

export interface SittingSummary {
  totalSeconds: number;
  breakSeconds: number;
  byDomain: Partial<Record<SittingDomain, DomainSummary>>;
  counts: { items: number; stimuli: number; breaks: number };
  /** The session ceiling this sitting was measured against. */
  maxSeconds: number;
  overBudget: boolean;
  /** "you asked for 8 analogies, the bank has 5" — never a silent shrink. */
  notes: string[];
}

export interface Sitting {
  meta: BankMeta;
  rules: Rulebook;
  blueprint: Blueprint | null;
  seed: string | null;
  steps: Step[];
  summary: SittingSummary;
}
