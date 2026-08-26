export const ActivityLocation = {
  ONSITE: 'ONSITE',
  ONLINE: 'ONLINE',
  HYBRID: 'HYBRID',
} as const;

export type ActivityLocation = (typeof ActivityLocation)[keyof typeof ActivityLocation];

export const ActivityMediaKind = {
  IMAGE: 'IMAGE',
  VIDEO: 'VIDEO',
} as const;

export type ActivityMediaKind = (typeof ActivityMediaKind)[keyof typeof ActivityMediaKind];

export const ActivityLifecycleStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  PAUSED: 'PAUSED',
  ARCHIVED: 'ARCHIVED',
} as const;

export type ActivityLifecycleStatus =
  (typeof ActivityLifecycleStatus)[keyof typeof ActivityLifecycleStatus];

export const PublicActivitySort = {
  PUBLISHED_DESC: 'PUBLISHED_DESC',
  PRICE_ASC: 'PRICE_ASC',
  PRICE_DESC: 'PRICE_DESC',
  TITLE_ASC: 'TITLE_ASC',
  DURATION_ASC: 'DURATION_ASC',
} as const;

export type PublicActivitySort = (typeof PublicActivitySort)[keyof typeof PublicActivitySort];

export const ProviderActivitySort = {
  CREATED_DESC: 'CREATED_DESC',
  PRICE_ASC: 'PRICE_ASC',
  PRICE_DESC: 'PRICE_DESC',
  TITLE_ASC: 'TITLE_ASC',
  DURATION_ASC: 'DURATION_ASC',
} as const;

export type ProviderActivitySort = (typeof ProviderActivitySort)[keyof typeof ProviderActivitySort];
