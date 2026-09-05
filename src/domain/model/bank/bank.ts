/* A whole psychometric test as it sits on disk. Mirrors schema/bank.schema.json. */

import type { BankMeta } from './bank-meta.ts';
import type { ScaleTable } from './scale-table.ts';
import type { Section } from './section.ts';
import type { WritingTask } from './writing-task.ts';

export interface Bank {
  meta?: BankMeta;
  writingTask?: WritingTask;
  /** This booklet's printed conversion table, when the extractor found one. */
  scale?: ScaleTable;
  sections: Section[];
}
