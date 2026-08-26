import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { AdminCategoriesController } from './admin-categories.controller.js';
import { CategoriesController } from './categories.controller.js';
import { CategoriesService } from './categories.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [AdminCategoriesController, CategoriesController],
  providers: [CategoriesService],
})
export class CategoriesModule {}
