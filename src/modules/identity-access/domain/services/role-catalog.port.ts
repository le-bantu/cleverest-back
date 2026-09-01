export const ROLE_CATALOG = Symbol('ROLE_CATALOG');

/**
 * PORT. Read model over the role → permission mapping (seeded in DB).
 * Used to expand a user's effective permissions for tokens / authorization.
 */
export abstract class RoleCatalogPort {
  abstract roleExists(name: string): Promise<boolean>;
  abstract permissionsForRoles(roleNames: string[]): Promise<string[]>;
}
