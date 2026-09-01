import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import {
  REFRESH_TOKEN_REPOSITORY,
  RefreshTokenRepository,
  USER_REPOSITORY,
  UserRepository,
} from '../../domain';
import { DeactivateOwnAccountInput } from '../dto/user.dto';

@Injectable()
export class DeactivateOwnAccountUseCase implements UseCase<DeactivateOwnAccountInput, void> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepository,
  ) {}

  async execute(input: DeactivateOwnAccountInput): Promise<void> {
    const user = await this.users.findById(input.userId);
    if (!user || user.isDeleted) {
      throw new NotFoundException('USER_NOT_FOUND', 'User not found');
    }
    user.deactivate();
    await this.users.save(user);
    await this.refreshTokens.revokeAllForUser(user.id);
  }
}
