/* What a countdown reports back while it runs. */

export interface CountdownHandlers {
  onTick(remaining: number, total: number): void;
  onExpire(): void;
}
