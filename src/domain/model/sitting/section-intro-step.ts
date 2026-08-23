/* The title card that opens a chapter. */

import type { Domain } from '../bank/domain.ts';
import type { StepBase } from './step-base.ts';

export interface SectionIntroStep extends StepBase {
  kind: 'section-intro';
  domain: Domain;
  sectionId: string;
  title: string;
  subtitle: string;
  itemCount: number;
  seconds: number;
}
