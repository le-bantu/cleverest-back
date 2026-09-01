import { BaseDomainEvent } from '@shared/kernel';

export class UserRegistered extends BaseDomainEvent {
  readonly name = 'identity.user-registered';

  constructor(userId: string, payload: { email: string | null; roles: string[] }) {
    super(userId, payload);
  }
}
