import { Controller, Get, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../../common/auth/public.decorator.js';
import { ApiErrorResponseDto } from '../../common/exceptions/api-error-response.dto.js';
import { CategoriesService } from './categories.service.js';
import { PublicCategoryListQueryDto } from './dto/category-request.dto.js';
import { PublicCategoryPageResponseDto } from './dto/category-response.dto.js';

@ApiTags('Marketplace Categories')
@Public()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOperation({
    summary: 'List active marketplace categories with bounded pagination',
    description: 'Returns only active categories and excludes administrative category metadata.',
  })
  @ApiOkResponse({ type: PublicCategoryPageResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto, description: 'Invalid list query' })
  list(@Query() query: PublicCategoryListQueryDto): Promise<PublicCategoryPageResponseDto> {
    return this.categories.listPublic(query);
  }
}
