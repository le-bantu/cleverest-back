import { FixedClock } from '@shared/kernel';
import { AuthorizationPolicy } from './authorization-policy';
import { User } from '../entities/user.entity';
import { Email } from '../value-objects/email.vo';
import { RoleName } from '../value-objects/role.vo';
import { PermissionName } from '../value-objects/permission.vo';

const clock = new FixedClock(new Date('2026-01-01T00:00:00.000Z'));
const policy = new AuthorizationPolicy();

const admin = () =>
  User.createByAdmin(
    {
      id: '33333333-3333-4333-8333-333333333333',
      email: Email.create('admin@x.com'),
      passwordHash: 'h',
      roles: [RoleName.ADMIN],
      directPermissions: [PermissionName.MANAGE_USERS],
    },
    clock,
  );

describe('AuthorizationPolicy', () => {
  it('grants a permission held directly', () => {
    expect(policy.hasPermission(admin(), 'manage-users', [])).toBe(true);
  });

  it('grants a permission inherited from a role', () => {
    expect(policy.hasPermission(admin(), 'view-statistics', ['view-statistics'])).toBe(true);
  });

  it('denies a permission that is neither direct nor role-inherited', () => {
    expect(policy.hasPermission(admin(), 'view-statistics', ['manage-quotes'])).toBe(false);
  });

  it('effectivePermissions is the union of direct + role permissions', () => {
    const eff = policy.effectivePermissions(admin(), ['manage-quotes', 'manage-users']);
    expect([...eff].sort()).toEqual(['manage-quotes', 'manage-users']);
  });

  it('hasAllPermissions requires every listed permission', () => {
    const u = admin();
    expect(
      policy.hasAllPermissions(u, ['manage-users', 'view-statistics'], ['view-statistics']),
    ).toBe(true);
    expect(policy.hasAllPermissions(u, ['manage-users', 'pay-apporteurs'], [])).toBe(false);
  });

  it('role helpers reflect the user roles', () => {
    expect(policy.hasAnyRole(admin(), ['admin', 'superadmin'])).toBe(true);
    expect(policy.hasRole(admin(), 'client')).toBe(false);
  });
});
