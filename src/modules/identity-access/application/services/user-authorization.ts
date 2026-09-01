import { ForbiddenException } from '@shared/kernel';
import { PermissionName, Role, RoleName } from '../../domain';
import { ActorInfo } from '../dto/user.dto';

const has = (actor: ActorInfo, permission: string) => actor.permissions.includes(permission);
const isAdminLike = (actor: ActorInfo) => Role.isAdminLike(actor.roles);

export const assertAdminLike = (actor: ActorInfo): void => {
  if (!isAdminLike(actor)) {
    throw new ForbiddenException('FORBIDDEN', 'Requires an admin role');
  }
};

export const assertCanManageUsers = (actor: ActorInfo): void => {
  assertAdminLike(actor);
  if (!has(actor, PermissionName.MANAGE_USERS)) {
    throw new ForbiddenException('FORBIDDEN', 'Missing permission: manage-users');
  }
};

/**
 * Creating or assigning an `admin`/`superadmin` role requires `create-admin`
 * (superadmin); any other role requires `create-user`.
 */
export const assertCanAssignRoles = (actor: ActorInfo, roles: string[]): void => {
  assertAdminLike(actor);
  const touchesAdmin = roles.some((r) => r === RoleName.ADMIN || r === RoleName.SUPERADMIN);
  if (touchesAdmin) {
    if (!has(actor, PermissionName.CREATE_ADMIN)) {
      throw new ForbiddenException('FORBIDDEN', 'Missing permission: create-admin');
    }
  } else if (!has(actor, PermissionName.CREATE_USER) && !has(actor, PermissionName.MANAGE_USERS)) {
    throw new ForbiddenException('FORBIDDEN', 'Missing permission: create-user');
  }
};

export const assertSelfOrCanManageUsers = (actor: ActorInfo, targetUserId: string): void => {
  if (actor.userId === targetUserId) return;
  assertCanManageUsers(actor);
};

export const assertSelfOrAdmin = (actor: ActorInfo, targetUserId: string): void => {
  if (actor.userId === targetUserId) return;
  assertAdminLike(actor);
};
