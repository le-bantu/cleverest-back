import { Permission, PermissionName } from './permission.vo';
import { ValidationException } from '@shared/kernel';

describe('Permission', () => {
  it('contains the ubiquitous-language catalogue', () => {
    expect(Permission.ALL).toEqual(
      expect.arrayContaining([
        'manage-users',
        'create-user',
        'create-admin',
        'manage-quotes',
        'assign-consultants',
        'validate-deliverables',
        'validate-payments',
        'pay-consultants',
        'pay-apporteurs',
        'view-statistics',
        'view-dashboard',
      ]),
    );
  });

  it('ensure() validates names', () => {
    expect(Permission.ensure('manage-users')).toBe(PermissionName.MANAGE_USERS);
    expect(() => Permission.ensure('be-god')).toThrow(ValidationException);
  });
});
