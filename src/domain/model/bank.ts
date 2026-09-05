/* The input format: a psychometric test expressed as a bank of items.
 * Mirrors schema/bank.schema.json. Nothing here knows how a sitting is built.
 *
 * One type per file under ./bank/; this barrel is the import surface. */

export type { AnswerIndex } from './bank/answer-index.ts';
export type { Bank } from './bank/bank.ts';
export type { BankMeta } from './bank/bank-meta.ts';
export type { Direction } from './bank/direction.ts';
export type { Domain } from './bank/domain.ts';
export type { Item } from './bank/item.ts';
export type { ItemType } from './bank/item-type.ts';
export type { ScaleTable } from './bank/scale-table.ts';
export type { Section } from './bank/section.ts';
export type { SittingDomain } from './bank/sitting-domain.ts';
export type { Stimulus } from './bank/stimulus.ts';
export type { StimulusKind } from './bank/stimulus-kind.ts';
export type { UnverifiedBank } from './bank/unverified-bank.ts';
export type { WritingTask } from './bank/writing-task.ts';
