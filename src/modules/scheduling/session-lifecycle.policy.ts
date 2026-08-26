import { Injectable } from '@nestjs/common';

import { ActivitySessionStatus } from '../../generated/prisma/enums.js';
import { invalidSchedule, schedulingConflict } from './scheduling-errors.js';

@Injectable()
export class SessionLifecyclePolicy {
  assertCapacity(capacity: number, bookedCount: number, maximumParticipants: number | null): void {
    if (capacity < bookedCount) {
      throw schedulingConflict(
        'SESSION_CAPACITY_BELOW_BOOKED_COUNT',
        'Capacity cannot be reduced below the booked count.',
      );
    }
    if (maximumParticipants !== null && capacity > maximumParticipants) {
      throw invalidSchedule(
        'SESSION_CAPACITY_EXCEEDS_ACTIVITY_MAXIMUM',
        'Session capacity cannot exceed the activity maximum participants.',
      );
    }
  }

  assertMutable(status: ActivitySessionStatus): void {
    if (status !== ActivitySessionStatus.SCHEDULED) {
      throw invalidSchedule('SESSION_NOT_MUTABLE', 'Only a scheduled session can be changed.');
    }
  }

  assertTimeMutable(bookedCount: number): void {
    if (bookedCount > 0) {
      throw schedulingConflict(
        'SESSION_TIME_HAS_BOOKINGS',
        'A session with bookings cannot be rescheduled by the scheduling workflow.',
      );
    }
  }

  assertCancellable(status: ActivitySessionStatus, bookedCount: number): void {
    if (status === ActivitySessionStatus.COMPLETED) {
      throw invalidSchedule(
        'SESSION_ALREADY_COMPLETED',
        'A completed session cannot be cancelled.',
      );
    }
    if (bookedCount > 0) {
      throw schedulingConflict(
        'SESSION_CANCELLATION_REQUIRES_BOOKING_WORKFLOW',
        'Sessions with bookings must be cancelled by the transactional refund workflow.',
      );
    }
  }

  assertCompletable(status: ActivitySessionStatus, endsAt: Date, now: Date): void {
    if (status === ActivitySessionStatus.CANCELLED) {
      throw invalidSchedule('SESSION_CANCELLED', 'A cancelled session cannot be completed.');
    }
    if (endsAt > now) {
      throw invalidSchedule('SESSION_NOT_ENDED', 'A session can be completed only after it ends.');
    }
  }
}
