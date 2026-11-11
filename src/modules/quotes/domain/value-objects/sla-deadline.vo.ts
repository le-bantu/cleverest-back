import { AbstractValueObject, ValidationException } from '@shared/kernel';

/** Default SLA windows inherited from the legacy app (24h for admin and consultant). */
export const ADMIN_SLA_HOURS = 24;
export const CONSULTANT_SLA_HOURS = 24;

export class SlaDeadline extends AbstractValueObject<{ at: string }> {
  private constructor(at: Date) {
    super({ at: at.toISOString() });
  }

  static at(date: Date): SlaDeadline {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      throw new ValidationException('INVALID_DEADLINE', 'Deadline must be a valid date');
    }
    return new SlaDeadline(date);
  }

  static hoursFrom(now: Date, hours: number): SlaDeadline {
    return SlaDeadline.at(new Date(now.getTime() + hours * 3600 * 1000));
  }

  get date(): Date {
    return new Date(this.props.at);
  }

  isExceeded(now: Date): boolean {
    return now.getTime() > this.date.getTime();
  }
}
