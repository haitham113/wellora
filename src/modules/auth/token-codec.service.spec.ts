import { TokenCodec } from './token-codec.service.js';

describe('TokenCodec', () => {
  const codec = new TokenCodec();

  it('generates an opaque selector and secret token', () => {
    const token = codec.generate();

    expect(token.value).toBe(`${token.selector}.${token.secret}`);
    expect(codec.parse(token.value)).toEqual({ selector: token.selector, secret: token.secret });
  });

  it.each([
    '',
    'selector.secret.extra',
    'not-a-uuid.secret',
    '00000000-0000-4000-8000-000000000000.short',
  ])('rejects malformed token %p', (token) => {
    expect(codec.parse(token)).toBeNull();
  });

  it('compares one-time token digests without storing the secret', () => {
    const secret = codec.generate().secret;
    const digest = codec.digest(secret);

    expect(digest).not.toContain(secret);
    expect(codec.matchesDigest(secret, digest)).toBe(true);
    expect(codec.matchesDigest(codec.generate().secret, digest)).toBe(false);
  });
});
