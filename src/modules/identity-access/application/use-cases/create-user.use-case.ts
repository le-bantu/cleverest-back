import { Inject, Injectable } from '@nestjs/common';
import { Clock, CLOCK, ConflictException } from '@shared/kernel';
import { EVENT_BUS, EventBusPort } from '@shared/application/ports/event-bus.port';
import { UseCase } from '@shared/application/use-case';
import {
  Email,
  Password,
  PasswordHasher,
  PASSWORD_HASHER,
  Role,
  User,
  USER_REPOSITORY,
  UserRepository,
} from '../../domain';
import { CreateUserInput, CreateUserOutput } from '../dto/user.dto';
import { assertCanAssignRoles } from '../services/user-authorization';

@Injectable()
export class CreateUserUseCase implements UseCase<CreateUserInput, CreateUserOutput> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(EVENT_BUS) private readonly eventBus: EventBusPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreateUserInput): Promise<CreateUserOutput> {
    const roles = input.roles.map((r) => Role.ensure(r));
    assertCanAssignRoles(input.actor, roles);

    const email = Email.create(input.email);
    const password = Password.create(input.password);
    if (await this.users.existsByEmail(email.value)) {
      throw new ConflictException(
        'EMAIL_ALREADY_USED',
        'An account with this email already exists',
      );
    }

    const user = User.createByAdmin(
      {
        id: this.users.nextIdentity(),
        email,
        passwordHash: await this.hasher.hash(password.value),
        roles,
        phone: input.phone ?? null,
      },
      this.clock,
    );

    if (input.profile && user.profile) {
      user.profile.update(input.profile as never);
    }

    await this.users.save(user);
    await this.eventBus.publish(user.pullDomainEvents());
    return { userId: user.id };
  }
}
