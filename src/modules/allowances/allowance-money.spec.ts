import { ApplicationException } from '../../common/exceptions/application.exception.js';
import { parsePositiveMinorUnits, parseSignedMinorUnits } from './allowance-money.js';

describe('allowance money', () => {
  it('parses values beyond JavaScript safe integers without floating point', () => {
    expect(parsePositiveMinorUnits('9007199254740993')).toBe(9_007_199_254_740_993n);
    expect(parseSignedMinorUnits('-9007199254740993')).toBe(-9_007_199_254_740_993n);
  });

  it.each(['0', '-1', '1.25', '01', '9223372036854775808'])(
    'rejects invalid positive minor-unit value %s',
    (value) => {
      expect(() => parsePositiveMinorUnits(value)).toThrow(ApplicationException);
    },
  );

  it.each(['0', '+1', '1.25', '-9223372036854775808'])(
    'rejects invalid signed minor-unit value %s',
    (value) => {
      expect(() => parseSignedMinorUnits(value)).toThrow(ApplicationException);
    },
  );
});
