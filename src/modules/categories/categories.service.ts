import { Injectable } from '@nestjs/common';

import { catalogPaginationMeta } from '../../common/pagination/catalog-pagination.dto.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { isUniqueConstraintError, normalizeSlug } from '../organizations/organization-errors.js';
import {
  activityConflict,
  categoryNotFound,
  invalidActivityOperation,
} from '../activities/activity-errors.js';
import type {
  AdminCategoryListQueryDto,
  CreateCategoryDto,
  PublicCategoryListQueryDto,
  UpdateCategoryDto,
} from './dto/category-request.dto.js';
import type {
  CategoryPageResponseDto,
  CategoryResponseDto,
  PublicCategoryPageResponseDto,
} from './dto/category-response.dto.js';

const categorySelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  isActive: true,
  displayOrder: true,
  createdAt: true,
  updatedAt: true,
} as const;

const publicCategorySelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
} as const;

@Injectable()
export class CategoriesService {
  constructor(private readonly database: PrismaService) {}

  async create(input: CreateCategoryDto): Promise<CategoryResponseDto> {
    try {
      const record = await this.database.category.create({
        data: {
          name: requiredCategoryName(input.name),
          slug: input.slug,
          normalizedSlug: normalizeSlug(input.slug),
          displayOrder: input.displayOrder ?? 0,
          ...(input.description === undefined ? {} : { description: input.description }),
        },
        select: categorySelect,
      });
      return this.map(record);
    } catch (error: unknown) {
      this.rethrowConflict(error);
    }
  }

  listAdmin(query: AdminCategoryListQueryDto): Promise<CategoryPageResponseDto> {
    return this.list(query, query.isActive);
  }

  async listPublic(query: PublicCategoryListQueryDto): Promise<PublicCategoryPageResponseDto> {
    const search = normalizeSearch(query.search);
    const where = {
      isActive: true,
      ...(search === undefined ? {} : { searchText: { contains: search } }),
    };
    const records = await this.database.category.findMany({
      where,
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit + 1,
      select: publicCategorySelect,
    });
    const hasNextPage = records.length > query.limit;
    return {
      data: records.slice(0, query.limit),
      meta: catalogPaginationMeta(query.page, query.limit, hasNextPage),
    };
  }

  async get(categoryId: string): Promise<CategoryResponseDto> {
    const record = await this.database.category.findUnique({
      where: { id: categoryId },
      select: categorySelect,
    });
    if (record === null) throw categoryNotFound();
    return this.map(record);
  }

  async update(categoryId: string, input: UpdateCategoryDto): Promise<CategoryResponseDto> {
    if (Object.keys(input).length === 0) {
      throw invalidActivityOperation(
        'CATEGORY_UPDATE_EMPTY',
        'At least one category field must be supplied for update.',
      );
    }
    await this.assertExists(categoryId);
    try {
      const record = await this.database.category.update({
        where: { id: categoryId },
        data: {
          ...(input.name === undefined ? {} : { name: requiredCategoryName(input.name) }),
          ...(input.slug === undefined
            ? {}
            : { slug: input.slug, normalizedSlug: normalizeSlug(input.slug) }),
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.displayOrder === undefined ? {} : { displayOrder: input.displayOrder }),
        },
        select: categorySelect,
      });
      return this.map(record);
    } catch (error: unknown) {
      this.rethrowConflict(error);
    }
  }

  async setActive(categoryId: string, isActive: boolean): Promise<CategoryResponseDto> {
    await this.assertExists(categoryId);
    const record = await this.database.category.update({
      where: { id: categoryId },
      data: { isActive },
      select: categorySelect,
    });
    return this.map(record);
  }

  private async list(
    query: PublicCategoryListQueryDto | AdminCategoryListQueryDto,
    isActive: boolean | undefined,
  ): Promise<CategoryPageResponseDto> {
    const search = normalizeSearch(query.search);
    const where = {
      ...(isActive === undefined ? {} : { isActive }),
      ...(search === undefined ? {} : { searchText: { contains: search } }),
    };
    const records = await this.database.category.findMany({
      where,
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit + 1,
      select: categorySelect,
    });
    const hasNextPage = records.length > query.limit;
    return {
      data: records.slice(0, query.limit).map((record) => this.map(record)),
      meta: catalogPaginationMeta(query.page, query.limit, hasNextPage),
    };
  }

  private async assertExists(categoryId: string): Promise<void> {
    const category = await this.database.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (category === null) throw categoryNotFound();
  }

  private rethrowConflict(error: unknown): never {
    if (isUniqueConstraintError(error)) {
      throw activityConflict('CATEGORY_SLUG_EXISTS', 'A category with this slug already exists.');
    }
    throw error;
  }

  private map(record: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    isActive: boolean;
    displayOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }): CategoryResponseDto {
    return {
      ...record,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}

function normalizeSearch(value: string | undefined): string | undefined {
  const normalized = value?.normalize('NFKC').trim().toLowerCase();
  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
}

function requiredCategoryName(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw invalidActivityOperation('CATEGORY_NAME_INVALID', 'Category name cannot be blank.');
  }
  return normalized;
}
