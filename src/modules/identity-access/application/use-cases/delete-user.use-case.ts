import { Inject, Injectable } from '@nestjs/common';
import { Clock, CLOCK, ConflictException, NotFoundException } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import { USER_REPOSITORY, UserRepository } from '../../domain';
import { DeleteUserInput } from '../dto/user.dto';
import { assertCanManageUsers } from '../services/user-authorization';

@Injectable()
export class DeleteUserUseCase implements UseCase<DeleteUserInput, void> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: DeleteUserInput): Promise<void> {
    assertCanManageUsers(input.actor);
    if (input.actor.userId === input.targetUserId) {
      throw new ConflictException('CANNOT_DELETE_SELF', 'You cannot delete your own account here');
    }
    const user = await this.users.findById(input.targetUserId);
    if (!user) {
      throw new NotFoundException('USER_NOT_FOUND', 'User not found');
    }
    user.softDelete(this.clock);
    await this.users.save(user);
  }
}
