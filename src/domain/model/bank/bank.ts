/* A whole psychometric test as it sits on disk. Mirrors schema/bank.schema.json. */

import type { BankMeta } from './bank-meta.ts';
import type { Section } from './section.ts';
import type { WritingTask } from './writing-task.ts';

export interface Bank {
  meta?: BankMeta;
  writingTask?: WritingTask;
  sections: Section[];
}
