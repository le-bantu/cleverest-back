import { AbstractValueObject, ValidationException } from '@shared/kernel';

interface MoneyProps {
  /** amount in major units, rounded to 2 decimals */
  amount: number;
  currency: string;
}

export const DEFAULT_CURRENCY = 'EUR';
const MAX_AMOUNT = 999_999_999_999.99; // Decimal(14,2)

/** Strictly positive monetary amount (a quote price is never zero or negative). */
export class Money extends AbstractValueObject<MoneyProps> {
  private constructor(props: MoneyProps) {
    super(props);
  }

  static of(amount: number, currency: string = DEFAULT_CURRENCY): Money {
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      throw new ValidationException('INVALID_AMOUNT', 'Amount must be a finite number');
    }
    const rounded = Math.round(amount * 100) / 100;
    if (rounded <= 0) {
      throw new ValidationException('INVALID_AMOUNT', 'Amount must be strictly positive');
    }
    if (rounded > MAX_AMOUNT) {
      throw new ValidationException('INVALID_AMOUNT', 'Amount is too large');
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new ValidationException('INVALID_CURRENCY', `Invalid currency "${currency}"`);
    }
    return new Money({ amount: rounded, currency });
  }

  get amount(): number {
    return this.props.amount;
  }

  get currency(): string {
    return this.props.currency;
  }
}
