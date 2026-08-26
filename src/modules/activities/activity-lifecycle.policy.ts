import { Injectable } from '@nestjs/common';

import {
  ActivityLocationType,
  ActivityStatus,
  OrganizationStatus,
} from '../../generated/prisma/enums.js';
import { invalidActivityOperation } from './activity-errors.js';

export interface PublishableActivity {
  shortDescription: string | null;
  fullDescription: string | null;
  priceMinor: bigint | null;
  currency: string | null;
  durationMinutes: number | null;
  locationType: ActivityLocationType | null;
  addressLine1: string | null;
  city: string | null;
  country: string | null;
  onlineUrl: string | null;
  minParticipants: number | null;
  maxParticipants: number | null;
  cancellationPolicy: string | null;
  cancellationWindowMinutes: number | null;
  bookingCutoffMinutes: number | null;
}

const transitions: Readonly<Record<ActivityStatus, readonly ActivityStatus[]>> = {
  [ActivityStatus.DRAFT]: [ActivityStatus.PUBLISHED, ActivityStatus.ARCHIVED],
  [ActivityStatus.PUBLISHED]: [ActivityStatus.PAUSED, ActivityStatus.ARCHIVED],
  [ActivityStatus.PAUSED]: [ActivityStatus.PUBLISHED, ActivityStatus.ARCHIVED],
  [ActivityStatus.ARCHIVED]: [],
};

@Injectable()
export class ActivityLifecyclePolicy {
  assertMutable(status: ActivityStatus): void {
    if (status === ActivityStatus.ARCHIVED) {
      throw invalidActivityOperation('ACTIVITY_ARCHIVED', 'Archived activities cannot be changed.');
    }
  }

  assertTransition(current: ActivityStatus, target: ActivityStatus): void {
    if (current === target) {
      return;
    }
    if (!transitions[current].includes(target)) {
      throw invalidActivityOperation(
        'ACTIVITY_STATUS_TRANSITION_INVALID',
        `An activity cannot transition from ${current} to ${target}.`,
      );
    }
  }

  assertPublishable(
    activity: PublishableActivity,
    categoryIsActive: boolean,
    providerStatus: OrganizationStatus,
  ): void {
    const missingFields = this.missingPublishFields(activity);
    if (missingFields.length > 0) {
      throw invalidActivityOperation(
        'ACTIVITY_NOT_PUBLISHABLE',
        'The activity is missing fields required for publication.',
        { fields: missingFields },
      );
    }
    if (!categoryIsActive) {
      throw invalidActivityOperation(
        'ACTIVITY_CATEGORY_INACTIVE',
        'An activity can be published only in an active category.',
      );
    }
    if (providerStatus !== OrganizationStatus.ACTIVE) {
      throw invalidActivityOperation(
        'ACTIVITY_PROVIDER_INACTIVE',
        'An activity can be published only by an active provider.',
      );
    }
  }

  private missingPublishFields(activity: PublishableActivity): string[] {
    const missing: string[] = [];
    if (this.blank(activity.shortDescription)) missing.push('shortDescription');
    if (this.blank(activity.fullDescription)) missing.push('fullDescription');
    if (activity.priceMinor === null) missing.push('priceMinor');
    if (activity.currency === null) missing.push('currency');
    if (activity.durationMinutes === null) missing.push('durationMinutes');
    if (activity.locationType === null) missing.push('locationType');
    if (activity.minParticipants === null) missing.push('minParticipants');
    if (activity.maxParticipants === null) missing.push('maxParticipants');
    if (this.blank(activity.cancellationPolicy)) missing.push('cancellationPolicy');
    if (activity.cancellationWindowMinutes === null) {
      missing.push('cancellationWindowMinutes');
    }
    if (activity.bookingCutoffMinutes === null) missing.push('bookingCutoffMinutes');

    if (
      activity.locationType === ActivityLocationType.ONSITE ||
      activity.locationType === ActivityLocationType.HYBRID
    ) {
      if (this.blank(activity.addressLine1)) missing.push('addressLine1');
      if (this.blank(activity.city)) missing.push('city');
      if (activity.country === null) missing.push('country');
    }
    if (
      activity.locationType === ActivityLocationType.ONLINE ||
      activity.locationType === ActivityLocationType.HYBRID
    ) {
      if (this.blank(activity.onlineUrl)) missing.push('onlineUrl');
    }
    return missing;
  }

  private blank(value: string | null): boolean {
    return value === null || value.trim().length === 0;
  }
}
