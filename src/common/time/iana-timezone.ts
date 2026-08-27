import { IANAZone } from 'luxon';

export function canonicalIanaTimezone(timezone: string): string | null {
  if (!IANAZone.isValidZone(timezone)) return null;
  try {
    const canonical = new Intl.DateTimeFormat('en-US', { timeZone: timezone }).resolvedOptions()
      .timeZone;
    return IANAZone.isValidZone(canonical) ? canonical : null;
  } catch {
    return null;
  }
}
