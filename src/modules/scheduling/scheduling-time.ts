export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000);
}

export function subtractMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() - minutes * 60_000);
}
