import type { ConfigService } from '@nestjs/config';

import type { EnvironmentVariables } from '../../config/environment.schema.js';
import { PasswordHasher } from './password-hasher.service.js';

describe('PasswordHasher', () => {
  const config = {
    get(key: keyof EnvironmentVariables): number {
      const values = {
        ARGON2_MEMORY_COST_KIB: 19_456,
        ARGON2_TIME_COST: 2,
        ARGON2_PARALLELISM: 1,
      };
      return values[key as keyof typeof values];
    },
  } as ConfigService<EnvironmentVariables, true>;
  const hasher = new PasswordHasher(config);

  it('stores a salted Argon2id hash and verifies the password', async () => {
    const first = await hasher.hash('a strong portfolio password');
    const second = await hasher.hash('a strong portfolio password');

    expect(first).toMatch(/^\$argon2id\$/);
    expect(first).not.toBe(second);
    await expect(hasher.verify(first, 'a strong portfolio password')).resolves.toBe(true);
    await expect(hasher.verify(first, 'wrong password')).resolves.toBe(false);
    expect(hasher.needsRehash(first)).toBe(false);
  });

  it('treats malformed stored hashes as a failed comparison', async () => {
    await expect(hasher.verify('not-an-argon-hash', 'password')).resolves.toBe(false);
  });
});
