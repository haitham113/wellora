import { ApiProperty } from '@nestjs/swagger';

import { CatalogPaginationMetaDto } from '../../../common/pagination/catalog-pagination.dto.js';
import {
  ActivityLifecycleStatus,
  ActivityLocation,
  ActivityMediaKind,
  type ActivityLifecycleStatus as ActivityLifecycleStatusValue,
  type ActivityLocation as ActivityLocationValue,
  type ActivityMediaKind as ActivityMediaKindValue,
} from './activity-api.enums.js';

export class ActivityProviderSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'MoveWell Studios' })
  businessName!: string;

  @ApiProperty({ example: 'movewell-studios' })
  slug!: string;
}

export class ActivityCategorySummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Fitness' })
  name!: string;

  @ApiProperty({ example: 'fitness' })
  slug!: string;
}

export class ActivityMediaResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ActivityMediaKind })
  type!: ActivityMediaKindValue;

  @ApiProperty({ format: 'uri' })
  url!: string;

  @ApiProperty({ nullable: true })
  altText!: string | null;

  @ApiProperty()
  displayOrder!: number;
}

export class PublicActivitySummaryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: ActivityProviderSummaryDto })
  provider!: ActivityProviderSummaryDto;

  @ApiProperty({ type: ActivityCategorySummaryDto })
  category!: ActivityCategorySummaryDto;

  @ApiProperty({ example: 'Restorative Yoga' })
  title!: string;

  @ApiProperty({ example: 'restorative-yoga' })
  slug!: string;

  @ApiProperty({ example: 'A calm guided practice.' })
  shortDescription!: string;

  @ApiProperty({ example: '2500', description: 'Non-negative integer minor units as a string' })
  priceMinor!: string;

  @ApiProperty({ example: 'EGP', description: 'ISO 4217 currency code for priceMinor' })
  currency!: string;

  @ApiProperty({ example: 60 })
  durationMinutes!: number;

  @ApiProperty({ enum: ActivityLocation })
  locationType!: ActivityLocationValue;

  @ApiProperty({ nullable: true })
  venueName!: string | null;

  @ApiProperty({ nullable: true })
  city!: string | null;

  @ApiProperty({ nullable: true })
  region!: string | null;

  @ApiProperty({ nullable: true, example: 'EG' })
  country!: string | null;

  @ApiProperty({
    type: ActivityMediaResponseDto,
    isArray: true,
    description: 'At most the first ordered media item for list rendering',
  })
  media!: ActivityMediaResponseDto[];

  @ApiProperty({ format: 'date-time' })
  publishedAt!: string;
}

export class PublicActivityResponseDto extends PublicActivitySummaryResponseDto {
  @ApiProperty({ example: 'A complete guided practice for workplace wellbeing.' })
  fullDescription!: string;

  @ApiProperty({ nullable: true })
  addressLine1!: string | null;

  @ApiProperty({ nullable: true })
  addressLine2!: string | null;

  @ApiProperty({ nullable: true })
  postalCode!: string | null;

  @ApiProperty({
    nullable: true,
    format: 'uri',
    description: 'Public HTTPS landing URL; private session join URLs are never exposed here',
  })
  onlineUrl!: string | null;

  @ApiProperty({ example: 1 })
  minParticipants!: number;

  @ApiProperty({ example: 12 })
  maxParticipants!: number;

  @ApiProperty({ example: 'Cancel at least one day before the activity.' })
  cancellationPolicy!: string;

  @ApiProperty({ example: 1440 })
  cancellationWindowMinutes!: number;

  @ApiProperty({ example: 120 })
  bookingCutoffMinutes!: number;

  @ApiProperty({ type: ActivityMediaResponseDto, isArray: true })
  declare media: ActivityMediaResponseDto[];
}

export class PublicActivityPageResponseDto {
  @ApiProperty({ type: PublicActivitySummaryResponseDto, isArray: true })
  data!: PublicActivitySummaryResponseDto[];

  @ApiProperty({ type: CatalogPaginationMetaDto })
  meta!: CatalogPaginationMetaDto;
}

export class ProviderActivitySummaryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: ActivityProviderSummaryDto })
  provider!: ActivityProviderSummaryDto;

  @ApiProperty({ type: ActivityCategorySummaryDto })
  category!: ActivityCategorySummaryDto;

  @ApiProperty({ example: 'Restorative Yoga' })
  title!: string;

  @ApiProperty({ example: 'restorative-yoga' })
  slug!: string;

  @ApiProperty({ nullable: true })
  shortDescription!: string | null;

  @ApiProperty({ nullable: true, example: '2500', description: 'Integer minor units as a string' })
  priceMinor!: string | null;

  @ApiProperty({ nullable: true, example: 'EGP' })
  currency!: string | null;

  @ApiProperty({ nullable: true, example: 60 })
  durationMinutes!: number | null;

  @ApiProperty({ nullable: true, enum: ActivityLocation })
  locationType!: ActivityLocationValue | null;

  @ApiProperty({ nullable: true })
  venueName!: string | null;

  @ApiProperty({ nullable: true })
  city!: string | null;

  @ApiProperty({ nullable: true })
  region!: string | null;

  @ApiProperty({ nullable: true, example: 'EG' })
  country!: string | null;

  @ApiProperty({ enum: ActivityLifecycleStatus })
  status!: ActivityLifecycleStatusValue;

  @ApiProperty({
    type: ActivityMediaResponseDto,
    isArray: true,
    description: 'At most the first ordered media item for list rendering',
  })
  media!: ActivityMediaResponseDto[];

  @ApiProperty({ nullable: true, format: 'date-time' })
  publishedAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class ProviderActivityResponseDto extends ProviderActivitySummaryResponseDto {
  @ApiProperty({ nullable: true })
  fullDescription!: string | null;

  @ApiProperty({ nullable: true })
  addressLine1!: string | null;

  @ApiProperty({ nullable: true })
  addressLine2!: string | null;

  @ApiProperty({ nullable: true })
  postalCode!: string | null;

  @ApiProperty({
    nullable: true,
    format: 'uri',
    description: 'Public HTTPS landing URL; omission retains and null clears during PATCH',
  })
  onlineUrl!: string | null;

  @ApiProperty({ nullable: true })
  minParticipants!: number | null;

  @ApiProperty({ nullable: true })
  maxParticipants!: number | null;

  @ApiProperty({ nullable: true })
  cancellationPolicy!: string | null;

  @ApiProperty({ nullable: true })
  cancellationWindowMinutes!: number | null;

  @ApiProperty({ nullable: true })
  bookingCutoffMinutes!: number | null;

  @ApiProperty({ type: ActivityMediaResponseDto, isArray: true })
  declare media: ActivityMediaResponseDto[];
}

export class ProviderActivityPageResponseDto {
  @ApiProperty({ type: ProviderActivitySummaryResponseDto, isArray: true })
  data!: ProviderActivitySummaryResponseDto[];

  @ApiProperty({ type: CatalogPaginationMetaDto })
  meta!: CatalogPaginationMetaDto;
}
