import { ValidationException } from '@shared/kernel';

/** Ubiquitous-language permission catalogue (architecture doc §6). */
export enum PermissionName {
  VIEW_DASHBOARD = 'view-dashboard',
  VIEW_STATISTICS = 'view-statistics',
  MANAGE_USERS = 'manage-users',
  CREATE_USER = 'create-user',
  CREATE_ADMIN = 'create-admin',
  MANAGE_QUOTES = 'manage-quotes',
  ASSIGN_CONSULTANTS = 'assign-consultants',
  VALIDATE_DELIVERABLES = 'validate-deliverables',
  VALIDATE_PAYMENTS = 'validate-payments',
  PAY_CONSULTANTS = 'pay-consultants',
  PAY_APPORTEURS = 'pay-apporteurs',
}

export class Permission {
  static readonly ALL: readonly PermissionName[] = Object.values(PermissionName);

  static isValid(name: string): name is PermissionName {
    return (Permission.ALL as string[]).includes(name);
  }

  static ensure(name: string): PermissionName {
    if (!Permission.isValid(name)) {
      throw new ValidationException('INVALID_PERMISSION', `Unknown permission "${name}"`);
    }
    return name;
  }
}
