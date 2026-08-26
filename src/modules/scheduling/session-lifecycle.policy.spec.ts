import { ApplicationException } from '../../common/exceptions/application.exception.js';
import { ActivitySessionStatus } from '../../generated/prisma/enums.js';
import { SessionLifecyclePolicy } from './session-lifecycle.policy.js';

describe('SessionLifecyclePolicy', () => {
  const policy = new SessionLifecyclePolicy();

  it('prevents reducing capacity below booked count or above the activity maximum', () => {
    expect(
      applicationErrorCode(() => {
        policy.assertCapacity(2, 3, 10);
      }),
    ).toBe('SESSION_CAPACITY_BELOW_BOOKED_COUNT');
    expect(
      applicationErrorCode(() => {
        policy.assertCapacity(11, 0, 10);
      }),
    ).toBe('SESSION_CAPACITY_EXCEEDS_ACTIVITY_MAXIMUM');
    expect(() => {
      policy.assertCapacity(3, 3, 10);
    }).not.toThrow();
  });

  it('fails closed when a booked session needs rescheduling or provider cancellation', () => {
    expect(
      applicationErrorCode(() => {
        policy.assertTimeMutable(1);
      }),
    ).toBe('SESSION_TIME_HAS_BOOKINGS');
    expect(
      applicationErrorCode(() => {
        policy.assertCancellable(ActivitySessionStatus.SCHEDULED, 1);
      }),
    ).toBe('SESSION_CANCELLATION_REQUIRES_BOOKING_WORKFLOW');
  });

  it('permits completion only after a scheduled session ends', () => {
    const now = new Date('2027-01-01T10:00:00.000Z');
    expect(() => {
      policy.assertCompletable(
        ActivitySessionStatus.SCHEDULED,
        new Date('2027-01-01T09:00:00.000Z'),
        now,
      );
    }).not.toThrow();
    expect(
      applicationErrorCode(() => {
        policy.assertCompletable(
          ActivitySessionStatus.SCHEDULED,
          new Date('2027-01-01T11:00:00.000Z'),
          now,
        );
      }),
    ).toBe('SESSION_NOT_ENDED');
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
