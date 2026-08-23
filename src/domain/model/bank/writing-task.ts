/* The essay prompt that opens a sitting. */

export interface WritingTask {
  prompt: string;
  intro?: string;
  minutes?: number;
  minLines?: number;
  /** A picture of the task as printed. Stands in for `prompt` when set. */
  image?: string;
}
