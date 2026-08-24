import { resolveRequestId } from './request-id.middleware.js';

describe('resolveRequestId', () => {
  it('preserves a trusted caller-provided identifier', () => {
    expect(resolveRequestId('request-123')).toBe('request-123');
  });

  it.each([undefined, '', 'contains spaces', 'x'.repeat(129), ['multiple', 'values']])(
    'replaces an untrusted identifier: %p',
    (value) => {
      expect(resolveRequestId(value)).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    },
  );
});
