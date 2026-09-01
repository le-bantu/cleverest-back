import { User } from '../entities/user.entity';

/**
 * DOMAIN SERVICE (pure). Resolves whether a user holds a permission —
 * either granted directly or inherited from one of their roles. The caller
 * pre-expands role permissions (via RoleCatalogPort) and passes them in.
 */
export class AuthorizationPolicy {
  effectivePermissions(user: User, rolePermissions: Iterable<string>): Set<string> {
    return new Set<string>([...user.directPermissions, ...rolePermissions]);
  }

  hasPermission(user: User, permission: string, rolePermissions: Iterable<string>): boolean {
    return this.effectivePermissions(user, rolePermissions).has(permission);
  }

  hasAllPermissions(
    user: User,
    permissions: string[],
    rolePermissions: Iterable<string>,
  ): boolean {
    const held = this.effectivePermissions(user, rolePermissions);
    return permissions.every((p) => held.has(p));
  }

  hasRole(user: User, role: string): boolean {
    return user.roles.includes(role as never);
  }

  hasAnyRole(user: User, roles: string[]): boolean {
    return roles.some((r) => this.hasRole(user, r));
  }
}
