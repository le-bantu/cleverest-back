import { ValidationException } from '@shared/kernel';

export enum RoleName {
  CLIENT = 'client',
  CONSULTANT = 'consultant',
  APPORTEUR = 'apporteur',
  ADMIN = 'admin',
  SUPERADMIN = 'superadmin',
}

export class Role {
  static readonly ALL: readonly RoleName[] = Object.values(RoleName);

  /** Roles a public self-registration may request. */
  static readonly SELF_ASSIGNABLE: readonly RoleName[] = [
    RoleName.CLIENT,
    RoleName.CONSULTANT,
    RoleName.APPORTEUR,
  ];

  static isValid(name: string): name is RoleName {
    return (Role.ALL as string[]).includes(name);
  }

  static ensure(name: string): RoleName {
    if (!Role.isValid(name)) {
      throw new ValidationException('INVALID_ROLE', `Unknown role "${name}"`);
    }
    return name;
  }

  static isSelfAssignable(name: string): boolean {
    return (Role.SELF_ASSIGNABLE as string[]).includes(name);
  }

  static isAdminLike(names: string[]): boolean {
    return names.includes(RoleName.ADMIN) || names.includes(RoleName.SUPERADMIN);
  }
}
