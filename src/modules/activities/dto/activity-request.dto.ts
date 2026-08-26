import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { CatalogPageQueryDto } from '../../../common/pagination/catalog-pagination.dto.js';
import {
  ActivityLifecycleStatus,
  ActivityLocation,
  ActivityMediaKind,
  ProviderActivitySort,
  PublicActivitySort,
  type ActivityLifecycleStatus as ActivityLifecycleStatusValue,
  type ActivityLocation as ActivityLocationValue,
  type ActivityMediaKind as ActivityMediaKindValue,
  type ProviderActivitySort as ProviderActivitySortValue,
  type PublicActivitySort as PublicActivitySortValue,
} from './activity-api.enums.js';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const countryPattern = /^[A-Z]{2}$/;
const currencyPattern = /^[A-Z]{3}$/;
const minorUnitsPattern = /^(0|[1-9][0-9]{0,18})$/;
const MAX_DATABASE_INTEGER = 2_147_483_647;

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.normalize('NFKC').trim() : value;
}

export class ActivityMediaInputDto {
  @ApiProperty({ enum: ActivityMediaKind })
  @IsEnum(ActivityMediaKind)
  type!: ActivityMediaKindValue;

  @ApiProperty({ format: 'uri', example: 'https://cdn.example.com/yoga.jpg' })
  @Transform(trimString)
  @IsUrl({ protocols: ['https'], require_protocol: true, require_valid_protocol: true })
  @MaxLength(2048)
  url!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 240 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(240)
  altText?: string | null;

  @ApiPropertyOptional({ type: Number, default: 0, minimum: 0, maximum: 32_767 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(32_767)
  displayOrder = 0;
}

export class CreateActivityDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  categoryId!: string;

  @ApiProperty({ example: 'Restorative Yoga' })
  @Transform(trimString)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @ApiProperty({ example: 'restorative-yoga', pattern: slugPattern.source })
  @Transform(trimString)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Matches(slugPattern)
  slug!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(500)
  shortDescription?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 10_000 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(10_000)
  fullDescription?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: '2500',
    description: 'Price in the currency minor unit; never a floating-point amount',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Matches(minorUnitsPattern)
  priceMinor?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'EGP', pattern: currencyPattern.source })
  @IsOptional()
  @Transform(trimString)
  @Matches(currencyPattern)
  currency?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 60, minimum: 1, maximum: 32_767 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(32_767)
  durationMinutes?: number | null;

  @ApiPropertyOptional({ nullable: true, enum: ActivityLocation })
  @IsOptional()
  @IsEnum(ActivityLocation)
  locationType?: ActivityLocationValue | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 160 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(160)
  venueName?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 200 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(200)
  addressLine1?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 200 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(200)
  addressLine2?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Cairo', maxLength: 120 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  city?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 120 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  region?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 32 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(32)
  postalCode?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'EG', pattern: countryPattern.source })
  @IsOptional()
  @Transform(trimString)
  @Matches(countryPattern)
  country?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    format: 'uri',
    description: 'Public HTTPS landing URL only; never a private session join URL',
  })
  @IsOptional()
  @Transform(trimString)
  @IsUrl({ protocols: ['https'], require_protocol: true, require_valid_protocol: true })
  @MaxLength(2048)
  onlineUrl?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 1, minimum: 1, maximum: 32_767 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(32_767)
  minParticipants?: number | null;

  @ApiPropertyOptional({ nullable: true, example: 12, minimum: 1, maximum: 32_767 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(32_767)
  maxParticipants?: number | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 5000 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(5000)
  cancellationPolicy?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 1440,
    minimum: 0,
    maximum: MAX_DATABASE_INTEGER,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_DATABASE_INTEGER)
  cancellationWindowMinutes?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 120,
    minimum: 0,
    maximum: MAX_DATABASE_INTEGER,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_DATABASE_INTEGER)
  bookingCutoffMinutes?: number | null;

  @ApiPropertyOptional({
    type: () => ActivityMediaInputDto,
    isArray: true,
    maxItems: 20,
    description:
      'When supplied during PATCH, replaces the complete ordered media collection; omission retains existing media',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ActivityMediaInputDto)
  media?: ActivityMediaInputDto[];
}

export class UpdateActivityDto extends PartialType(CreateActivityDto) {}

export class ActivityFiltersDto extends CatalogPageQueryDto {
  @ApiPropertyOptional({ example: 'yoga', minLength: 2, maxLength: 120 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @ApiPropertyOptional({ enum: ActivityLocation })
  @IsOptional()
  @IsEnum(ActivityLocation)
  locationType?: ActivityLocationValue;

  @ApiPropertyOptional({ example: 'EG', pattern: countryPattern.source })
  @IsOptional()
  @Transform(trimString)
  @Matches(countryPattern)
  country?: string;

  @ApiPropertyOptional({
    example: 'Cairo',
    minLength: 1,
    maxLength: 120,
    description: 'Exact case-insensitive city match after Unicode normalization',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  city?: string;
}

export class PublicActivityListQueryDto extends ActivityFiltersDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  providerId?: string;

  @ApiPropertyOptional({
    example: 'EGP',
    pattern: currencyPattern.source,
    description: 'Required for price filtering or price sorting',
  })
  @IsOptional()
  @Transform(trimString)
  @Matches(currencyPattern)
  currency?: string;

  @ApiPropertyOptional({ type: String, example: '1000', pattern: minorUnitsPattern.source })
  @IsOptional()
  @IsString()
  @Matches(minorUnitsPattern)
  minPriceMinor?: string;

  @ApiPropertyOptional({ type: String, example: '5000', pattern: minorUnitsPattern.source })
  @IsOptional()
  @IsString()
  @Matches(minorUnitsPattern)
  maxPriceMinor?: string;

  @ApiPropertyOptional({ enum: PublicActivitySort, default: PublicActivitySort.PUBLISHED_DESC })
  @IsOptional()
  @IsEnum(PublicActivitySort)
  sort: PublicActivitySortValue = PublicActivitySort.PUBLISHED_DESC;
}

export class ProviderActivityListQueryDto extends ActivityFiltersDto {
  @ApiPropertyOptional({ enum: ActivityLifecycleStatus })
  @IsOptional()
  @IsEnum(ActivityLifecycleStatus)
  status?: ActivityLifecycleStatusValue;

  @ApiPropertyOptional({ enum: ProviderActivitySort, default: ProviderActivitySort.CREATED_DESC })
  @IsOptional()
  @IsEnum(ProviderActivitySort)
  sort: ProviderActivitySortValue = ProviderActivitySort.CREATED_DESC;
}
