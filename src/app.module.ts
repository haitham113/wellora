import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';

import { ApiExceptionFilter } from './common/exceptions/api-exception.filter.js';
import { buildLoggerOptions } from './common/logging/logger-options.js';
import { type EnvironmentVariables, validateEnvironment } from './config/environment.schema.js';
import { ActivitiesModule } from './modules/activities/activities.module.js';
import { CategoriesModule } from './modules/categories/categories.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { EmployersModule } from './modules/employers/employers.module.js';
import { ProvidersModule } from './modules/providers/providers.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => buildLoggerOptions(config),
    }),
    ActivitiesModule,
    AuthModule,
    CategoriesModule,
    EmployersModule,
    HealthModule,
    ProvidersModule,
    UsersModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: ApiExceptionFilter,
    },
  ],
})
export class AppModule {}
