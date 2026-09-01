import { FixedClock, ConflictException, UnauthorizedException } from '@shared/kernel';
import { User } from './user.entity';
import { Email } from '../value-objects/email.vo';
import { RoleName } from '../value-objects/role.vo';
import { PermissionName } from '../value-objects/permission.vo';
import { UserRegistered } from '../events/user-registered.event';
import { TwoFactorToggled } from '../events/two-factor-toggled.event';

const clock = new FixedClock(new Date('2026-01-01T00:00:00.000Z'));

const register = (over: Partial<Parameters<typeof User.register>[0]> = {}) =>
  User.register(
    {
      id: '11111111-1111-4111-8111-111111111111',
      email: Email.create('user@x.com'),
      passwordHash: 'argon:pw',
      role: RoleName.CLIENT,
      ...over,
    },
    clock,
  );

describe('User.register', () => {
  it('creates an active user with the requested role, empty profile and a UserRegistered event', () => {
    const u = register();
    expect(u.isActive).toBe(true);
    expect(u.roles).toEqual(['client']);
    expect(u.twoFactorEnabled).toBe(false);
    expect(u.profile?.kind).toBe('client');
    expect(u.pullDomainEvents()[0]).toBeInstanceOf(UserRegistered);
  });

  it('maps admin role to an admin profile', () => {
    expect(register({ role: RoleName.SUPERADMIN }).profile?.kind).toBe('admin');
  });

  it('rejects an unknown role', () => {
    expect(() => register({ role: 'root' as RoleName })).toThrow();
  });
});

describe('User.createByAdmin', () => {
  it('requires at least one role', () => {
    expect(() =>
      User.createByAdmin({ id: 'x', email: null, passwordHash: 'h', roles: [] }, clock),
    ).toThrow(ConflictException);
  });

  it('accepts multiple roles and direct permissions', () => {
    const u = User.createByAdmin(
      {
        id: '22222222-2222-4222-8222-222222222222',
        email: Email.create('a@x.com'),
        passwordHash: 'h',
        roles: [RoleName.ADMIN],
        directPermissions: [PermissionName.VIEW_STATISTICS],
      },
      clock,
    );
    expect(u.roles).toEqual(['admin']);
    expect(u.directPermissions).toEqual(['view-statistics']);
  });
});

describe('User invariants', () => {
  it('cannot be re-activated once soft-deleted', () => {
    const u = register();
    u.softDelete(clock);
    expect(u.isDeleted).toBe(true);
    expect(u.isActive).toBe(false);
    expect(() => u.activate()).toThrow(ConflictException);
  });

  it('deactivate then authenticate is rejected', () => {
    const u = register();
    u.deactivate();
    expect(() => u.ensureCanAuthenticate()).toThrow(UnauthorizedException);
  });

  it('deleted account cannot authenticate', () => {
    const u = register();
    u.softDelete(clock);
    expect(() => u.ensureCanAuthenticate()).toThrow(UnauthorizedException);
  });

  it('changeEmail clears the verified timestamp', () => {
    const u = register();
    u.changeEmail(Email.create('new@x.com'));
    expect(u.emailValue).toBe('new@x.com');
    expect(u.emailVerifiedAt).toBeNull();
  });

  it('changePasswordHash rejects an empty hash', () => {
    expect(() => register().changePasswordHash('')).toThrow(ConflictException);
  });

  it('setRoles rejects an empty list', () => {
    expect(() => register().setRoles([])).toThrow(ConflictException);
  });

  it('setPhone trims and nulls blank input', () => {
    const u = register();
    u.setPhone('  +33102030405 ');
    expect(u.phone).toBe('+33102030405');
    u.setPhone('   ');
    expect(u.phone).toBeNull();
  });
});

describe('User getters & misc behaviour', () => {
  it('exposes timestamps, hash, verified state and admin-likeness', () => {
    const u = register();
    expect(u.passwordHash).toBe('argon:pw');
    expect(u.createdAt).toBeInstanceOf(Date);
    expect(u.updatedAt).toBeInstanceOf(Date);
    expect(u.emailVerifiedAt).toBeNull();
    expect(u.isAdminLike).toBe(false);
  });

  it('createByAdmin supports a null email and marks admin-likeness', () => {
    const u = User.createByAdmin(
      {
        id: '44444444-4444-4444-8444-444444444444',
        email: null,
        passwordHash: 'h',
        roles: [RoleName.ADMIN],
      },
      clock,
    );
    expect(u.emailValue).toBeNull();
    expect(u.isAdminLike).toBe(true);
    u.pullDomainEvents();
  });

  it('setDirectPermissions replaces the direct grants', () => {
    const u = register();
    u.setDirectPermissions([PermissionName.MANAGE_USERS, PermissionName.VIEW_STATISTICS]);
    expect(u.directPermissions.sort()).toEqual(['manage-users', 'view-statistics']);
  });

  it('reconstitute rebuilds the aggregate without emitting events', () => {
    const original = register();
    const rebuilt = User.reconstitute(original.id, {
      email: original.email,
      phone: original.phone,
      passwordHash: original.passwordHash,
      isActive: original.isActive,
      twoFactorEnabled: original.twoFactorEnabled,
      emailVerifiedAt: original.emailVerifiedAt,
      roles: new Set(original.roles),
      directPermissions: new Set(original.directPermissions),
      deletedAt: original.deletedAt,
      createdAt: original.createdAt,
      updatedAt: original.updatedAt,
      profile: original.profile,
    });
    expect(rebuilt.pullDomainEvents()).toHaveLength(0);
    expect(rebuilt.equals(original)).toBe(true);
  });

  it('softDelete is idempotent', () => {
    const u = register();
    u.softDelete(clock);
    const first = u.deletedAt;
    u.softDelete(clock);
    expect(u.deletedAt).toBe(first);
  });
});

describe('User.setTwoFactor', () => {
  it('emits TwoFactorToggled only on a real change', () => {
    const u = register();
    u.pullDomainEvents();
    u.setTwoFactor(false);
    expect(u.pullDomainEvents()).toHaveLength(0);
    u.setTwoFactor(true);
    const events = u.pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(TwoFactorToggled);
    expect(u.twoFactorEnabled).toBe(true);
  });
});
