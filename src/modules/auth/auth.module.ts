import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';

import { RolesGuard } from '../../common/auth/roles.guard.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { RedisModule } from '../../infrastructure/redis/redis.module.js';
import { AccessTokenGuard } from './access-token.guard.js';
import { AccessTokenService } from './access-token.service.js';
import { AuthController } from './auth.controller.js';
import { CredentialsService } from './credentials.service.js';
import { OneTimeTokenService } from './one-time-token.service.js';
import { PasswordHasher } from './password-hasher.service.js';
import { RateLimitGuard } from './rate-limit.guard.js';
import { SessionMetadataService } from './session-metadata.service.js';
import { SessionService } from './session.service.js';
import { TokenCodec } from './token-codec.service.js';

@Module({
  imports: [DatabaseModule, RedisModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AccessTokenService,
    CredentialsService,
    OneTimeTokenService,
    PasswordHasher,
    SessionMetadataService,
    SessionService,
    TokenCodec,
    { provide: APP_GUARD, useClass: AccessTokenGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
  exports: [OneTimeTokenService, PasswordHasher],
})
export class AuthModule {}
