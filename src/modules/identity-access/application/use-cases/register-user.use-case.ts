import { Inject, Injectable } from '@nestjs/common';
import { Clock, CLOCK, ConflictException, ForbiddenException } from '@shared/kernel';
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
import { RegisterUserInput, RegisterUserOutput } from '../dto/auth.dto';

@Injectable()
export class RegisterUserUseCase implements UseCase<RegisterUserInput, RegisterUserOutput> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(EVENT_BUS) private readonly eventBus: EventBusPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: RegisterUserInput): Promise<RegisterUserOutput> {
    const role = Role.ensure(input.role);
    if (!Role.isSelfAssignable(role)) {
      throw new ForbiddenException(
        'ROLE_NOT_SELF_ASSIGNABLE',
        `Role "${role}" cannot be self-registered`,
      );
    }

    const email = Email.create(input.email);
    const password = Password.create(input.password);

    if (await this.users.existsByEmail(email.value)) {
      throw new ConflictException(
        'EMAIL_ALREADY_USED',
        'An account with this email already exists',
      );
    }

    const user = User.register(
      {
        id: this.users.nextIdentity(),
        email,
        passwordHash: await this.hasher.hash(password.value),
        role,
        phone: input.phone ?? null,
      },
      this.clock,
    );

    await this.users.save(user);
    await this.eventBus.publish(user.pullDomainEvents());

    return { userId: user.id };
  }
}
