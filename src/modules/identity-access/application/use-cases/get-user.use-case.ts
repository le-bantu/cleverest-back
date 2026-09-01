import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import { ROLE_CATALOG, RoleCatalogPort, USER_REPOSITORY, UserRepository } from '../../domain';
import { GetUserInput } from '../dto/user.dto';
import { toUserView, UserView } from '../views/user.view';
import { assertSelfOrAdmin } from '../services/user-authorization';

@Injectable()
export class GetUserUseCase implements UseCase<GetUserInput, UserView> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(ROLE_CATALOG) private readonly roleCatalog: RoleCatalogPort,
  ) {}

  async execute(input: GetUserInput): Promise<UserView> {
    assertSelfOrAdmin(input.actor, input.targetUserId);
    const user = await this.users.findById(input.targetUserId);
    if (!user || user.isDeleted) {
      throw new NotFoundException('USER_NOT_FOUND', 'User not found');
    }
    const rolePermissions = await this.roleCatalog.permissionsForRoles(user.roles);
    const effective = [...new Set([...user.directPermissions, ...rolePermissions])];
    return toUserView(user, effective);
  }
}
