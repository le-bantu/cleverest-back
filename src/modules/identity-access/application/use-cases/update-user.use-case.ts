import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import {
  PasswordHasher,
  PASSWORD_HASHER,
  Role,
  ROLE_CATALOG,
  RoleCatalogPort,
  USER_REPOSITORY,
  UserRepository,
} from '../../domain';
import { UpdateUserInput } from '../dto/user.dto';
import { toUserView, UserView } from '../views/user.view';
import { assertSelfOrCanManageUsers, assertCanAssignRoles } from '../services/user-authorization';
import { applyUserChanges } from '../services/apply-user-changes';

@Injectable()
export class UpdateUserUseCase implements UseCase<UpdateUserInput, UserView> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(ROLE_CATALOG) private readonly roleCatalog: RoleCatalogPort,
  ) {}

  async execute(input: UpdateUserInput): Promise<UserView> {
    assertSelfOrCanManageUsers(input.actor, input.targetUserId);

    const user = await this.users.findById(input.targetUserId);
    if (!user || user.isDeleted) {
      throw new NotFoundException('USER_NOT_FOUND', 'User not found');
    }

    if (input.roles !== undefined) {
      const roles = input.roles.map((r) => Role.ensure(r));
      assertCanAssignRoles(input.actor, roles);
      user.setRoles(roles);
    }

    await applyUserChanges(user, input, { users: this.users, hasher: this.hasher });
    await this.users.save(user);

    const rolePermissions = await this.roleCatalog.permissionsForRoles(user.roles);
    const effective = [...new Set([...user.directPermissions, ...rolePermissions])];
    return toUserView(user, effective);
  }
}
