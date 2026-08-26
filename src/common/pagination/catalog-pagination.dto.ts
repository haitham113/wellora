import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

import { MAX_PAGE_SIZE, PageQueryDto } from './page-query.dto.js';

export const MAX_CATALOG_PAGE_NUMBER = 10_000;

export class CatalogPageQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: MAX_CATALOG_PAGE_NUMBER })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_CATALOG_PAGE_NUMBER)
  declare page: number;
}

export interface CatalogPaginationMeta {
  page: number;
  limit: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export class CatalogPaginationMetaDto {
  @ApiProperty({ example: 1, minimum: 1, maximum: MAX_CATALOG_PAGE_NUMBER })
  page!: number;

  @ApiProperty({ example: 20, minimum: 1, maximum: MAX_PAGE_SIZE })
  limit!: number;

  @ApiProperty({ example: true })
  hasNextPage!: boolean;

  @ApiProperty({ example: false })
  hasPreviousPage!: boolean;
}

export function catalogPaginationMeta(
  page: number,
  limit: number,
  hasNextPage: boolean,
): CatalogPaginationMeta {
  return {
    page,
    limit,
    hasNextPage,
    hasPreviousPage: page > 1,
  };
}
