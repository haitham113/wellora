import {
  ActivityLocationType,
  ActivityStatus,
  OrganizationStatus,
} from '../../generated/prisma/enums.js';
import { ApplicationException } from '../../common/exceptions/application.exception.js';
import { ActivityLifecyclePolicy, type PublishableActivity } from './activity-lifecycle.policy.js';

describe('ActivityLifecyclePolicy', () => {
  const policy = new ActivityLifecyclePolicy();
  const complete: PublishableActivity = {
    shortDescription: 'A guided session',
    fullDescription: 'A complete guided wellness session.',
    priceMinor: 2500n,
    currency: 'EGP',
    durationMinutes: 60,
    locationType: ActivityLocationType.HYBRID,
    addressLine1: '12 Nile Street',
    city: 'Cairo',
    country: 'EG',
    onlineUrl: 'https://example.com/session',
    minParticipants: 1,
    maxParticipants: 12,
    cancellationPolicy: 'Cancel at least one day before the session.',
    cancellationWindowMinutes: 1440,
    bookingCutoffMinutes: 120,
  };

  it('allows the documented lifecycle and treats archived activities as terminal', () => {
    expect(() => {
      policy.assertTransition(ActivityStatus.DRAFT, ActivityStatus.PUBLISHED);
    }).not.toThrow();
    expect(() => {
      policy.assertTransition(ActivityStatus.PUBLISHED, ActivityStatus.PAUSED);
    }).not.toThrow();
    expect(() => {
      policy.assertTransition(ActivityStatus.PAUSED, ActivityStatus.PUBLISHED);
    }).not.toThrow();
    expect(() => {
      policy.assertTransition(ActivityStatus.PUBLISHED, ActivityStatus.PUBLISHED);
    }).not.toThrow();
    expect(() => {
      policy.assertTransition(ActivityStatus.ARCHIVED, ActivityStatus.ARCHIVED);
    }).not.toThrow();
    expect(() => {
      policy.assertTransition(ActivityStatus.DRAFT, ActivityStatus.PAUSED);
    }).toThrow();
    expect(() => {
      policy.assertTransition(ActivityStatus.ARCHIVED, ActivityStatus.PUBLISHED);
    }).toThrow();
    expect(() => {
      policy.assertMutable(ActivityStatus.ARCHIVED);
    }).toThrow();
  });

  it('requires commercial, participation, cancellation, and location fields to publish', () => {
    expect(() => {
      policy.assertPublishable(complete, true, OrganizationStatus.ACTIVE);
    }).not.toThrow();

    const error = captureException(() => {
      policy.assertPublishable(
        { ...complete, priceMinor: null, onlineUrl: null },
        true,
        OrganizationStatus.ACTIVE,
      );
    });
    expect(error.getResponse()).toMatchObject({
      code: 'ACTIVITY_NOT_PUBLISHABLE',
      details: { fields: ['priceMinor', 'onlineUrl'] },
    });
  });

  it('rejects inactive category or provider publication', () => {
    const categoryError = captureException(() => {
      policy.assertPublishable(complete, false, OrganizationStatus.ACTIVE);
    });
    expect(categoryError.getResponse()).toMatchObject({ code: 'ACTIVITY_CATEGORY_INACTIVE' });

    const providerError = captureException(() => {
      policy.assertPublishable(complete, true, OrganizationStatus.INACTIVE);
    });
    expect(providerError.getResponse()).toMatchObject({ code: 'ACTIVITY_PROVIDER_INACTIVE' });
  });
});

function captureException(operation: () => void): ApplicationException {
  try {
    operation();
  } catch (error: unknown) {
    if (error instanceof ApplicationException) return error;
    throw error;
  }
  throw new Error('Expected operation to throw an ApplicationException.');
}
