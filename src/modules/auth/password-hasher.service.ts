import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { argon2id, hash, verify } from 'argon2';

import type { EnvironmentVariables } from '../../config/environment.schema.js';

@Injectable()
export class PasswordHasher {
  private readonly options: {
    type: typeof argon2id;
    memoryCost: number;
    timeCost: number;
    parallelism: number;
  };

  constructor(@Inject(ConfigService) config: ConfigService<EnvironmentVariables, true>) {
    this.options = {
      type: argon2id,
      memoryCost: config.get('ARGON2_MEMORY_COST_KIB', { infer: true }),
      timeCost: config.get('ARGON2_TIME_COST', { infer: true }),
      parallelism: config.get('ARGON2_PARALLELISM', { infer: true }),
    };
  }

  hash(value: string): Promise<string> {
    return hash(value, this.options);
  }

  async verify(hashValue: string, candidate: string): Promise<boolean> {
    try {
      return await verify(hashValue, candidate);
    } catch {
      return false;
    }
  }
}
