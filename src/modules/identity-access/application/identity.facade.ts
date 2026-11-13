import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Clock, CLOCK, ConflictException } from '@shared/kernel';
import { EVENT_BUS, EventBusPort } from '@shared/application/ports/event-bus.port';
import { PendingWrite } from '@shared/application/pending-write';
import {
  Email,
  PASSWORD_HASHER,
  PasswordHasher,
  RoleName,
  User,
  USER_REPOSITORY,
  UserRepository,
} from '../domain';

export interface ClientAccountRequest {
  email: string;
  /** company / display name for the client profile */
  name: string;
  phone?: string | null;
}

export interface PreparedClientAccount extends PendingWrite {
  clientId: string;
  /** false when an existing client account is reused */
  created: boolean;
  email: string;
  /** set only for a new account, to hand over to the client once */
  temporaryPassword: string | null;
}

const noop = () => Promise.resolve();

/** Public API of identity-access for other contexts (apporteurs). */
@Injectable()
export class IdentityFacade {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Reuses the client account of that email, or prepares a new `client` user
   * (random temporary password, profile name). An email used by a non-client
   * account is refused (409) — roles are never mixed silently.
   */
  async prepareClientAccount(input: ClientAccountRequest): Promise<PreparedClientAccount> {
    const email = Email.create(input.email);
    const existing = await this.users.findByEmail(email.value);
    if (existing) {
      if (existing.isDeleted || !existing.roles.includes(RoleName.CLIENT)) {
        throw new ConflictException(
          'EMAIL_USED_BY_NON_CLIENT',
          'This email belongs to an account that is not a client',
          { email: email.value },
        );
      }
      return {
        clientId: existing.id,
        created: false,
        email: email.value,
        temporaryPassword: null,
        persist: noop,
        finalize: noop,
      };
    }

    const temporaryPassword = randomBytes(12).toString('base64url');
    const user = User.createByAdmin(
      {
        id: this.users.nextIdentity(),
        email,
        passwordHash: await this.hasher.hash(temporaryPassword),
        roles: [RoleName.CLIENT],
        phone: input.phone ?? null,
      },
      this.clock,
    );
    user.profile?.update({ name: input.name } as never);
    return {
      clientId: user.id,
      created: true,
      email: email.value,
      temporaryPassword,
      persist: (tx) => this.users.save(user, tx),
      finalize: () => this.events.publish(user.pullDomainEvents()),
    };
  }
}
