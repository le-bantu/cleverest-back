import { ValidationException } from './domain-exception';

/** Largest amount a DECIMAL(14,2) column holds. */
export const MAX_AMOUNT = 999_999_999_999.99;

/** A strictly positive EUR amount rounded to cents (422 INVALID_AMOUNT otherwise). */
export const positiveAmount = (amount: number): number => {
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    throw new ValidationException('INVALID_AMOUNT', 'The amount must be a positive number');
  }
  return Math.round(amount * 100) / 100;
};

/** Sum rounded to cents (avoids 0.1 + 0.2 drift). */
export const sumAmounts = (amounts: readonly number[]): number =>
  Math.round(amounts.reduce((total, a) => total + a * 100, 0)) / 100;

/** `1234.5` → `1 234,50 €` (French formatting, stable across ICU builds). */
export const formatEuros = (amount: number): string => {
  const [int, dec] = amount.toFixed(2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${grouped},${dec} €`;
};
