import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { Role } from '../../common/auth/role.js';
import { RequireRoles } from '../../common/auth/roles.decorator.js';
import { ApiErrorResponseDto } from '../../common/exceptions/api-error-response.dto.js';
import { CategoriesService } from './categories.service.js';
import {
  AdminCategoryListQueryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from './dto/category-request.dto.js';
import { CategoryPageResponseDto, CategoryResponseDto } from './dto/category-response.dto.js';

@ApiTags('Platform Admin — Categories')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto })
@RequireRoles(Role.PLATFORM_ADMIN)
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a marketplace category' })
  @ApiCreatedResponse({ type: CategoryResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto, description: 'Invalid category payload' })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  create(@Body() input: CreateCategoryDto): Promise<CategoryResponseDto> {
    return this.categories.create(input);
  }

  @Get()
  @ApiOperation({ summary: 'Search and filter all categories with bounded pagination' })
  @ApiOkResponse({ type: CategoryPageResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto, description: 'Invalid list query' })
  list(@Query() query: AdminCategoryListQueryDto): Promise<CategoryPageResponseDto> {
    return this.categories.listAdmin(query);
  }

  @Get(':categoryId')
  @ApiOperation({ summary: 'Get any category' })
  @ApiOkResponse({ type: CategoryResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto, description: 'Invalid category UUID' })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto, description: 'CATEGORY_NOT_FOUND' })
  get(
    @Param('categoryId', new ParseUUIDPipe({ version: '4' })) categoryId: string,
  ): Promise<CategoryResponseDto> {
    return this.categories.get(categoryId);
  }

  @Patch(':categoryId')
  @ApiOperation({
    summary: 'Update a marketplace category',
    description:
      'Omitted fields are retained, nullable fields are cleared with null, and empty updates are rejected.',
  })
  @ApiOkResponse({ type: CategoryResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto, description: 'Invalid or empty update' })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto, description: 'CATEGORY_NOT_FOUND' })
  update(
    @Param('categoryId', new ParseUUIDPipe({ version: '4' })) categoryId: string,
    @Body() input: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    return this.categories.update(categoryId, input);
  }

  @Post(':categoryId/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Activate a category for discovery and publication',
    description: 'Idempotent when the category is already active.',
  })
  @ApiOkResponse({ type: CategoryResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto, description: 'Invalid category UUID' })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto, description: 'CATEGORY_NOT_FOUND' })
  activate(
    @Param('categoryId', new ParseUUIDPipe({ version: '4' })) categoryId: string,
  ): Promise<CategoryResponseDto> {
    return this.categories.setActive(categoryId, true);
  }

  @Post(':categoryId/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Deactivate a category and hide its published activities',
    description: 'Idempotent when the category is already inactive.',
  })
  @ApiOkResponse({ type: CategoryResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto, description: 'Invalid category UUID' })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto, description: 'CATEGORY_NOT_FOUND' })
  deactivate(
    @Param('categoryId', new ParseUUIDPipe({ version: '4' })) categoryId: string,
  ): Promise<CategoryResponseDto> {
    return this.categories.setActive(categoryId, false);
  }
}
