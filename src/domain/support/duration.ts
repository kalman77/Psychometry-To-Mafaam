/** Seconds as m:ss — the only time format the system prints. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${rest < 10 ? '0' : ''}${rest}`;
}

export function minutesOf(seconds: number): number {
  return Math.round(seconds / 60);
}
