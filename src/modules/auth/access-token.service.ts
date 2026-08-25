import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';

import type { EnvironmentVariables } from '../../config/environment.schema.js';

interface AccessTokenClaims {
  sub: string;
  sid: string;
  type: 'access';
}

@Injectable()
export class AccessTokenService {
  private readonly secret: string;
  private readonly issuer: string;
  private readonly audience: string;
  readonly ttlSeconds: number;

  constructor(
    private readonly jwt: JwtService,
    @Inject(ConfigService) config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.secret = config.get('JWT_ACCESS_SECRET', { infer: true });
    this.issuer = config.get('JWT_ISSUER', { infer: true });
    this.audience = config.get('JWT_AUDIENCE', { infer: true });
    this.ttlSeconds = config.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
  }

  sign(userId: string, sessionId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, sid: sessionId, type: 'access' } satisfies AccessTokenClaims,
      {
        secret: this.secret,
        algorithm: 'HS256',
        audience: this.audience,
        issuer: this.issuer,
        expiresIn: this.ttlSeconds,
        jwtid: randomUUID(),
      },
    );
  }

  async verify(token: string): Promise<AccessTokenClaims | null> {
    try {
      const claims = await this.jwt.verifyAsync<Record<string, unknown>>(token, {
        secret: this.secret,
        algorithms: ['HS256'],
        audience: this.audience,
        issuer: this.issuer,
      });

      return claims.type === 'access' &&
        typeof claims.sub === 'string' &&
        claims.sub.length > 0 &&
        typeof claims.sid === 'string' &&
        claims.sid.length > 0
        ? { sub: claims.sub, sid: claims.sid, type: 'access' }
        : null;
    } catch {
      return null;
    }
  }
}
