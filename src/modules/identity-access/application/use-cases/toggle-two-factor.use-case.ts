import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '@shared/kernel';
import { EVENT_BUS, EventBusPort } from '@shared/application/ports/event-bus.port';
import { UseCase } from '@shared/application/use-case';
import { USER_REPOSITORY, UserRepository } from '../../domain';
import { ToggleTwoFactorInput } from '../dto/user.dto';

@Injectable()
export class ToggleTwoFactorUseCase implements UseCase<
  ToggleTwoFactorInput,
  { twoFactorEnabled: boolean }
> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(EVENT_BUS) private readonly eventBus: EventBusPort,
  ) {}

  async execute(input: ToggleTwoFactorInput): Promise<{ twoFactorEnabled: boolean }> {
    const user = await this.users.findById(input.userId);
    if (!user || user.isDeleted) {
      throw new NotFoundException('USER_NOT_FOUND', 'User not found');
    }
    user.setTwoFactor(input.enabled);
    await this.users.save(user);
    await this.eventBus.publish(user.pullDomainEvents());
    return { twoFactorEnabled: user.twoFactorEnabled };
  }
}
