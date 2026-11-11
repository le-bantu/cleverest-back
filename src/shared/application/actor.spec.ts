import { actorKindOf, requireAdminWith, resolveActor } from './actor';

const ctx = (roles: string[], permissions: string[] = []) => ({
  userId: 'u1',
  roles,
  permissions,
});

describe('shared actor helpers', () => {
  it('maps roles to an audience with admin > consultant > client priority', () => {
    expect(actorKindOf(['superadmin'])).toBe('ADMIN');
    expect(actorKindOf(['consultant', 'client'])).toBe('CONSULTANT');
    expect(actorKindOf(['client'])).toBe('CLIENT');
    expect(actorKindOf(['apporteur'])).toBeNull();
  });

  it('resolveActor refuses audiences that are not allowed', () => {
    expect(resolveActor(ctx(['client']))).toEqual({ userId: 'u1', kind: 'CLIENT' });
    expect(() => resolveActor(ctx(['client']), ['ADMIN'])).toThrow(
      expect.objectContaining({ code: 'ROLE_NOT_ALLOWED', httpStatus: 403 }),
    );
    expect(() => resolveActor(ctx(['apporteur']))).toThrow(
      expect.objectContaining({ code: 'ROLE_NOT_ALLOWED' }),
    );
  });

  it('requireAdminWith needs the admin audience and the permission', () => {
    expect(requireAdminWith(ctx(['admin'], ['p']), 'p').kind).toBe('ADMIN');
    expect(() => requireAdminWith(ctx(['admin']), 'p')).toThrow(
      expect.objectContaining({ code: 'PERMISSION_REQUIRED' }),
    );
    expect(() => requireAdminWith(ctx(['consultant'], ['p']), 'p')).toThrow(
      expect.objectContaining({ code: 'ROLE_NOT_ALLOWED' }),
    );
  });
});
