/* One chapter of a bank: a domain's stimuli and questions. */

import type { Domain } from './domain.ts';
import type { Item } from './item.ts';
import type { Stimulus } from './stimulus.ts';

export interface Section {
  id: string;
  domain: Domain;
  title?: string;
  subtitle?: string;
  stimuli?: Stimulus[];
  items: Item[];
}
