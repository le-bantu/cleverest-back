import { AbstractValueObject } from '@shared/kernel';
import { invalidInvoiceNumber } from '../errors';

const PATTERN = /^FAC-(\d{4})-(\d{4,})$/;

/** `FAC-<year>-<sequence>` — sequential, gapless per calendar year (UTC). */
export class InvoiceNumber extends AbstractValueObject<{ value: string }> {
  static next(year: number, lastSequence: number): InvoiceNumber {
    return new InvoiceNumber({
      value: `FAC-${year}-${String(lastSequence + 1).padStart(4, '0')}`,
    });
  }

  static of(value: string): InvoiceNumber {
    if (!PATTERN.test(value)) throw invalidInvoiceNumber(value);
    return new InvoiceNumber({ value });
  }

  /** prefix shared by every number of the year, e.g. `FAC-2026-` */
  static prefixFor(year: number): string {
    return `FAC-${year}-`;
  }

  get value(): string {
    return this.props.value;
  }
  get year(): number {
    return Number(PATTERN.exec(this.props.value)![1]);
  }
  get sequence(): number {
    return Number(PATTERN.exec(this.props.value)![2]);
  }
}
