import type { Domain } from './domain.ts';

/** Every domain in a sitting, including the writing task (which has no items). */
export type SittingDomain = Domain | 'writing';
