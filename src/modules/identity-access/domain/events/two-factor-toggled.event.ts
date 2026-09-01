import { BaseDomainEvent } from '@shared/kernel';

export class TwoFactorToggled extends BaseDomainEvent {
  readonly name = 'identity.two-factor-toggled';

  constructor(userId: string, payload: { enabled: boolean }) {
    super(userId, payload);
  }
}
