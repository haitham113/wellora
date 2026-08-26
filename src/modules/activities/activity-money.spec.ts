import { ApplicationException } from '../../common/exceptions/application.exception.js';
import { parseMinorUnits } from './activity-money.js';

describe('parseMinorUnits', () => {
  it('parses exact decimal strings without passing through floating point', () => {
    expect(parseMinorUnits('9007199254740993')).toBe(9_007_199_254_740_993n);
  });

  it.each(['-1', '1.25', '01', '9223372036854775808'])('rejects unsafe amount %s', (value) => {
    expect(() => parseMinorUnits(value)).toThrow(ApplicationException);
  });
});
