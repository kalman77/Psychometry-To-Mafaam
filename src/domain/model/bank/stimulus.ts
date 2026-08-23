/* A passage, table or figure that one or more questions hang off. */

import type { Direction } from './direction.ts';
import type { StimulusKind } from './stimulus-kind.ts';

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
