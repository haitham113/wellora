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
  private readonly keyId: string;
  private readonly previousKeys: Readonly<Record<string, string>>;
  private readonly issuer: string;
  private readonly audience: string;
  readonly ttlSeconds: number;

  constructor(
    private readonly jwt: JwtService,
    @Inject(ConfigService) config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.secret = config.get('JWT_ACCESS_SECRET', { infer: true });
    this.keyId = config.get('JWT_ACCESS_KEY_ID', { infer: true });
    this.previousKeys = config.get('JWT_ACCESS_PREVIOUS_KEYS', { infer: true });
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
        keyid: this.keyId,
      },
    );
  }

  async verify(token: string): Promise<AccessTokenClaims | null> {
    const secret = this.resolveVerificationSecret(token);
    if (secret === null) {
      return null;
    }

    try {
      const claims = await this.jwt.verifyAsync<Record<string, unknown>>(token, {
        secret,
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

  private resolveVerificationSecret(token: string): string | null {
    const decoded: unknown = this.jwt.decode(token, { complete: true });
    if (typeof decoded !== 'object' || decoded === null || !('header' in decoded)) {
      return null;
    }

    const header = decoded.header;
    if (typeof header !== 'object' || header === null) {
      return null;
    }

    if (!('kid' in header)) {
      return this.secret;
    }

    const keyId = header.kid;
    if (typeof keyId !== 'string') {
      return null;
    }
    if (keyId === this.keyId) {
      return this.secret;
    }

    return this.previousKeys[keyId] ?? null;
  }
}
