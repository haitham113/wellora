import { ApiProperty } from '@nestjs/swagger';

import { CatalogPaginationMetaDto } from '../../../common/pagination/catalog-pagination.dto.js';

export class CategoryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Fitness' })
  name!: string;

  @ApiProperty({ example: 'fitness' })
  slug!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ example: 10 })
  displayOrder!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class PublicCategoryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Fitness' })
  name!: string;

  @ApiProperty({ example: 'fitness' })
  slug!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;
}

export class CategoryPageResponseDto {
  @ApiProperty({ type: CategoryResponseDto, isArray: true })
  data!: CategoryResponseDto[];

  @ApiProperty({ type: CatalogPaginationMetaDto })
  meta!: CatalogPaginationMetaDto;
}

export class PublicCategoryPageResponseDto {
  @ApiProperty({ type: PublicCategoryResponseDto, isArray: true })
  data!: PublicCategoryResponseDto[];

  @ApiProperty({ type: CatalogPaginationMetaDto })
  meta!: CatalogPaginationMetaDto;
}
