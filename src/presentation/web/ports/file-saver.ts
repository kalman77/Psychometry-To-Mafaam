/* Handing the finished attempt back to the learner. */

export interface FileSaver {
  save(filename: string, payload: unknown): void;
}
