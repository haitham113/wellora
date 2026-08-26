import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { CatalogPageQueryDto } from '../../../common/pagination/catalog-pagination.dto.js';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.normalize('NFKC').trim() : value;
}

export class CreateCategoryDto {
  @ApiProperty({ example: 'Fitness' })
  @Transform(trimString)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'fitness', pattern: slugPattern.source })
  @Transform(trimString)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Matches(slugPattern)
  slug!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: 32_767 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(32_767)
  displayOrder?: number;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export class AdminCategoryListQueryDto extends CatalogPageQueryDto {
  @ApiPropertyOptional({ example: 'fitness', minLength: 2, maxLength: 120 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;
}

export class PublicCategoryListQueryDto extends CatalogPageQueryDto {
  @ApiPropertyOptional({ example: 'fitness', minLength: 2, maxLength: 120 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  search?: string;
}
