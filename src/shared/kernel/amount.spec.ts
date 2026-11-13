import { formatEuros, MAX_AMOUNT, positiveAmount, sumAmounts } from './amount';

describe('amount helpers', () => {
  it('positiveAmount rounds to cents and refuses invalid values', () => {
    expect(positiveAmount(10.005)).toBe(10.01);
    expect(positiveAmount(MAX_AMOUNT)).toBe(MAX_AMOUNT);
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, MAX_AMOUNT + 1]) {
      expect(() => positiveAmount(bad)).toThrow(
        expect.objectContaining({ code: 'INVALID_AMOUNT', httpStatus: 422 }),
      );
    }
  });

  it('sumAmounts has no floating drift', () => {
    expect(sumAmounts([0.1, 0.2])).toBe(0.3);
    expect(sumAmounts([])).toBe(0);
  });

  it('formatEuros groups thousands the French way', () => {
    expect(formatEuros(1234.5)).toBe('1 234,50 €');
    expect(formatEuros(1234567)).toBe('1 234 567,00 €');
    expect(formatEuros(12)).toBe('12,00 €');
  });
});
