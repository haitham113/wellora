import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';

import { canonicalIanaTimezone } from '../../common/time/iana-timezone.js';
import { DstOverlapPolicy } from '../../generated/prisma/enums.js';
import { invalidSchedule } from './scheduling-errors.js';

const LOCAL_DATE_TIME_FORMAT = "yyyy-MM-dd'T'HH:mm";
const LOCAL_DATE_FORMAT = 'yyyy-MM-dd';

export interface ResolvedLocalTime {
  instant: Date;
  offsetMinutes: number;
}

@Injectable()
export class TimezoneService {
  canonicalizeIanaZone(timezone: string): string {
    const canonical = canonicalIanaTimezone(timezone);
    if (canonical === null) {
      throw invalidSchedule('INVALID_TIMEZONE', 'Timezone must be a valid IANA timezone.');
    }
    return canonical;
  }

  resolveLocalDateTime(
    localDateTime: string,
    timezone: string,
    overlapPolicy?: DstOverlapPolicy,
  ): ResolvedLocalTime | null {
    const canonicalTimezone = this.canonicalizeIanaZone(timezone);
    const calendarValue = DateTime.fromFormat(localDateTime, LOCAL_DATE_TIME_FORMAT, {
      locale: 'en-US',
      setZone: true,
      zone: 'UTC',
    });
    if (
      !calendarValue.isValid ||
      calendarValue.toFormat(LOCAL_DATE_TIME_FORMAT) !== localDateTime
    ) {
      throw invalidSchedule(
        'SESSION_LOCAL_TIME_INVALID',
        'The provider-local start time is not a valid calendar date and time.',
      );
    }
    const resolved = DateTime.fromFormat(localDateTime, LOCAL_DATE_TIME_FORMAT, {
      locale: 'en-US',
      setZone: true,
      zone: canonicalTimezone,
    });

    if (!resolved.isValid || resolved.toFormat(LOCAL_DATE_TIME_FORMAT) !== localDateTime) {
      return null;
    }

    const alternatives = uniqueInstants(resolved.getPossibleOffsets());
    if (alternatives.length > 1 && overlapPolicy === undefined) {
      throw invalidSchedule(
        'SESSION_LOCAL_TIME_AMBIGUOUS',
        'The provider-local start time occurs twice. Select an explicit DST overlap policy.',
        { availableOffsetsMinutes: alternatives.map((candidate) => candidate.offset) },
      );
    }

    const selected = this.selectOverlap(alternatives, overlapPolicy);
    return { instant: selected.toUTC().toJSDate(), offsetMinutes: selected.offset };
  }

  parseLocalDate(localDate: string): DateTime {
    const parsed = DateTime.fromFormat(localDate, LOCAL_DATE_FORMAT, { zone: 'UTC' });
    if (!parsed.isValid || parsed.toFormat(LOCAL_DATE_FORMAT) !== localDate) {
      throw invalidSchedule('SCHEDULE_DATE_INVALID', 'Schedule dates must be valid ISO dates.');
    }
    return parsed.startOf('day');
  }

  formatLocalDate(date: Date): string {
    return DateTime.fromJSDate(date, { zone: 'UTC' }).toFormat(LOCAL_DATE_FORMAT);
  }

  formatLocalDateTime(instant: Date, timezone: string): string {
    return DateTime.fromJSDate(instant, { zone: this.canonicalizeIanaZone(timezone) }).toFormat(
      LOCAL_DATE_TIME_FORMAT,
    );
  }

  formatLocalDateTimeAtOffset(instant: Date, offsetMinutes: number): string {
    return DateTime.fromJSDate(instant, { zone: 'UTC' })
      .plus({ minutes: offsetMinutes })
      .toFormat(LOCAL_DATE_TIME_FORMAT);
  }

  offsetAtInstant(instant: Date, timezone: string): number {
    return DateTime.fromJSDate(instant, { zone: this.canonicalizeIanaZone(timezone) }).offset;
  }

  private selectOverlap(
    alternatives: DateTime[],
    overlapPolicy: DstOverlapPolicy | undefined,
  ): DateTime {
    const fallback = alternatives[0];
    if (fallback === undefined) {
      throw invalidSchedule(
        'SESSION_LOCAL_TIME_INVALID',
        'The provider-local start time could not be resolved.',
      );
    }
    const ordered = [...alternatives].sort((left, right) => left.toMillis() - right.toMillis());
    if (overlapPolicy === DstOverlapPolicy.LATER) {
      return ordered.at(-1) ?? fallback;
    }
    return ordered[0] ?? fallback;
  }
}

function uniqueInstants(values: DateTime[]): DateTime[] {
  return values.filter(
    (value, index, all) =>
      all.findIndex((candidate) => candidate.toMillis() === value.toMillis()) === index,
  );
}
