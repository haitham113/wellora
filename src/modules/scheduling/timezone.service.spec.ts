import { ApplicationException } from '../../common/exceptions/application.exception.js';
import { DstOverlapPolicy } from '../../generated/prisma/enums.js';
import { TimezoneService } from './timezone.service.js';

describe('TimezoneService', () => {
  const timezone = new TimezoneService();

  it('converts an unambiguous provider-local time to UTC', () => {
    const resolved = timezone.resolveLocalDateTime('2027-01-15T09:30', 'Europe/London');

    expect(resolved).toEqual({
      instant: new Date('2027-01-15T09:30:00.000Z'),
      offsetMinutes: 0,
    });
  });

  it('detects a nonexistent local time instead of silently shifting it', () => {
    expect(timezone.resolveLocalDateTime('2027-03-28T01:30', 'Europe/London')).toBeNull();
  });

  it('requires and applies an explicit overlap policy', () => {
    expect(
      applicationErrorCode(() => {
        timezone.resolveLocalDateTime('2027-10-31T01:30', 'Europe/London');
      }),
    ).toBe('SESSION_LOCAL_TIME_AMBIGUOUS');

    const earlier = timezone.resolveLocalDateTime(
      '2027-10-31T01:30',
      'Europe/London',
      DstOverlapPolicy.EARLIER,
    );
    const later = timezone.resolveLocalDateTime(
      '2027-10-31T01:30',
      'Europe/London',
      DstOverlapPolicy.LATER,
    );

    expect(earlier).toEqual({
      instant: new Date('2027-10-31T00:30:00.000Z'),
      offsetMinutes: 60,
    });
    expect(later).toEqual({
      instant: new Date('2027-10-31T01:30:00.000Z'),
      offsetMinutes: 0,
    });
  });

  it('rejects fixed offsets and unknown names as provider IANA zones', () => {
    expect(
      applicationErrorCode(() => {
        timezone.assertIanaZone('UTC+02:00');
      }),
    ).toBe('INVALID_TIMEZONE');
  });
});

function applicationErrorCode(action: () => void): string {
  try {
    action();
  } catch (error: unknown) {
    if (!(error instanceof ApplicationException)) throw error;
    const response: unknown = error.getResponse();
    if (!hasErrorCode(response)) {
      throw new Error('Expected a machine-readable application error.', { cause: error });
    }
    return response.code;
  }
  throw new Error('Expected an application error.');
}

function hasErrorCode(value: unknown): value is { code: string } {
  return (
    typeof value === 'object' && value !== null && 'code' in value && typeof value.code === 'string'
  );
}
