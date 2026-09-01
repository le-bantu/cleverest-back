import { Inject, Injectable } from '@nestjs/common';
import { normalizePageQuery, Page } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import { ROLE_CATALOG, RoleCatalogPort, USER_REPOSITORY, UserRepository } from '../../domain';
import { ListUsersInput } from '../dto/user.dto';
import { toUserView, UserView } from '../views/user.view';

@Injectable()
export class ListUsersUseCase implements UseCase<ListUsersInput, Page<UserView>> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(ROLE_CATALOG) private readonly roleCatalog: RoleCatalogPort,
  ) {}

  async execute(input: ListUsersInput): Promise<Page<UserView>> {
    const query = normalizePageQuery(input);
    const page = await this.users.list(query, { role: input.role, search: input.search });

    const permsByRoleKey = new Map<string, string[]>();
    const views: UserView[] = [];
    for (const user of page.data) {
      const key = user.roles.slice().sort().join(',');
      let rolePerms = permsByRoleKey.get(key);
      if (!rolePerms) {
        rolePerms = await this.roleCatalog.permissionsForRoles(user.roles);
        permsByRoleKey.set(key, rolePerms);
      }
      views.push(toUserView(user, [...new Set([...user.directPermissions, ...rolePerms])]));
    }
    return new Page(views, page.meta.total, { page: query.page, perPage: query.perPage });
  }
}
