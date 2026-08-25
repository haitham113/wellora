import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

export interface OpaqueTokenParts {
  selector: string;
  secret: string;
  value: string;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const secretPattern = /^[A-Za-z0-9_-]{43}$/;

@Injectable()
export class TokenCodec {
  generate(): OpaqueTokenParts {
    const selector = randomUUID();
    const secret = randomBytes(32).toString('base64url');
    return { selector, secret, value: `${selector}.${secret}` };
  }

  parse(value: string): Pick<OpaqueTokenParts, 'selector' | 'secret'> | null {
    const [selector, secret, extra] = value.split('.');
    if (
      selector === undefined ||
      secret === undefined ||
      extra !== undefined ||
      !uuidPattern.test(selector) ||
      !secretPattern.test(secret)
    ) {
      return null;
    }

    return { selector, secret };
  }

  digest(secret: string): string {
    return createHash('sha256').update(secret, 'utf8').digest('hex');
  }

  matchesDigest(secret: string, expectedDigest: string): boolean {
    const actual = Buffer.from(this.digest(secret), 'hex');
    const expected = Buffer.from(expectedDigest, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
