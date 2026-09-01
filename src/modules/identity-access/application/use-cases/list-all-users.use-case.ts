import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@shared/application/use-case';
import { ROLE_CATALOG, RoleCatalogPort, USER_REPOSITORY, UserRepository } from '../../domain';
import { ListAllUsersInput } from '../dto/user.dto';
import { toUserView, UserView } from '../views/user.view';

/** GET /users/list — non-paginated, filtered by role and consultant expertise. */
@Injectable()
export class ListAllUsersUseCase implements UseCase<ListAllUsersInput, UserView[]> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(ROLE_CATALOG) private readonly roleCatalog: RoleCatalogPort,
  ) {}

  async execute(input: ListAllUsersInput): Promise<UserView[]> {
    const found = await this.users.listAll({ role: input.role, expertise: input.expertise });
    const out: UserView[] = [];
    for (const user of found) {
      const rolePerms = await this.roleCatalog.permissionsForRoles(user.roles);
      out.push(toUserView(user, [...new Set([...user.directPermissions, ...rolePerms])]));
    }
    return out;
  }
}
