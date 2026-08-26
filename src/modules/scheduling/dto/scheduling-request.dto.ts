import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { CatalogPageQueryDto } from '../../../common/pagination/catalog-pagination.dto.js';
import {
  ActivitySessionStatus,
  DstGapPolicy,
  DstOverlapPolicy,
} from '../../../generated/prisma/enums.js';

const localDateTimePattern = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/;
const localTimePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DATABASE_INTEGER = 2_147_483_647;

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.normalize('NFKC').trim() : value;
}

export class CreateOneTimeSessionDto {
  @ApiProperty({
    example: '2026-10-25T09:30',
    pattern: localDateTimePattern.source,
    description: 'Provider-local wall-clock time without an offset; the provider IANA zone is used',
  })
  @Transform(trimString)
  @Matches(localDateTimePattern)
  localStartsAt!: string;

  @ApiPropertyOptional({
    enum: DstOverlapPolicy,
    description: 'Required only when localStartsAt occurs twice during a DST fall-back transition',
  })
  @IsOptional()
  @IsEnum(DstOverlapPolicy)
  dstOverlapPolicy?: DstOverlapPolicy;

  @ApiPropertyOptional({ minimum: 1, maximum: 1440, example: 60 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  durationMinutes?: number;

  @ApiProperty({ minimum: 1, maximum: 32_767, example: 12 })
  @IsInt()
  @Min(1)
  @Max(32_767)
  capacity!: number;

  @ApiPropertyOptional({ minimum: 0, maximum: MAX_DATABASE_INTEGER, example: 120 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_DATABASE_INTEGER)
  bookingCutoffMinutes?: number;
}

export class UpdateSessionDto extends PartialType(CreateOneTimeSessionDto) {}

export class CancelSessionDto {
  @ApiProperty({ example: 'Instructor unavailable', minLength: 1, maxLength: 500 })
  @Transform(trimString)
  @IsString()
  @MaxLength(500)
  @Matches(/\S/)
  reason!: string;
}

export class CreateScheduleTemplateDto {
  @ApiProperty({ example: '09:30', pattern: localTimePattern.source })
  @Transform(trimString)
  @Matches(localTimePattern)
  localStartTime!: string;

  @ApiProperty({
    type: Number,
    isArray: true,
    example: [1, 3, 5],
    description: 'Unique ISO weekdays where Monday is 1 and Sunday is 7',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  weekdays!: number[];

  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1, maximum: 52 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(52)
  intervalWeeks = 1;

  @ApiProperty({ example: '2026-10-01', pattern: localDatePattern.source })
  @Transform(trimString)
  @Matches(localDatePattern)
  generationStartDate!: string;

  @ApiProperty({ example: '2026-12-31', pattern: localDatePattern.source })
  @Transform(trimString)
  @Matches(localDatePattern)
  generationEndDate!: string;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 1440, example: 60 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  durationMinutes?: number;

  @ApiProperty({ type: Number, minimum: 1, maximum: 32_767, example: 12 })
  @IsInt()
  @Min(1)
  @Max(32_767)
  capacity!: number;

  @ApiPropertyOptional({
    type: Number,
    minimum: 0,
    maximum: MAX_DATABASE_INTEGER,
    example: 120,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_DATABASE_INTEGER)
  bookingCutoffMinutes?: number;

  @ApiPropertyOptional({ enum: DstOverlapPolicy, default: DstOverlapPolicy.EARLIER })
  @IsOptional()
  @IsEnum(DstOverlapPolicy)
  dstOverlapPolicy: DstOverlapPolicy = DstOverlapPolicy.EARLIER;

  @ApiPropertyOptional({
    enum: DstGapPolicy,
    default: DstGapPolicy.SKIP,
    description: 'Nonexistent local occurrences are explicitly skipped',
  })
  @IsOptional()
  @IsEnum(DstGapPolicy)
  dstGapPolicy: DstGapPolicy = DstGapPolicy.SKIP;
}

export class AvailabilityQueryDto extends CatalogPageQueryDto {
  @ApiPropertyOptional({ format: 'date-time', description: 'Inclusive UTC/offset lower bound' })
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  from?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Inclusive UTC/offset upper bound' })
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  to?: string;
}

export class ProviderSessionListQueryDto extends AvailabilityQueryDto {
  @ApiPropertyOptional({ enum: ActivitySessionStatus })
  @IsOptional()
  @IsEnum(ActivitySessionStatus)
  status?: ActivitySessionStatus;
}

export class GenerateScheduleDto {
  @ApiPropertyOptional({
    example: '2026-11-30',
    pattern: localDatePattern.source,
    description: 'Optional inclusive cap inside the template generation window',
  })
  @IsOptional()
  @Transform(trimString)
  @Matches(localDatePattern)
  throughDate?: string;
}
