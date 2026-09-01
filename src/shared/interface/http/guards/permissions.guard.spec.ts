import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';

const build = (user: unknown, required: string[] | undefined) => {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(required);
  const ctx = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  return { guard: new PermissionsGuard(reflector), ctx };
};

describe('PermissionsGuard', () => {
  it('allows when no permissions are required', () => {
    const { guard, ctx } = build({ permissions: [] }, undefined);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows when the user holds every required permission', () => {
    const { guard, ctx } = build(
      { permissions: ['manage-users', 'view-statistics'] },
      ['manage-users', 'view-statistics'],
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('forbids when a required permission is missing (admin without view-statistics)', () => {
    const { guard, ctx } = build({ permissions: ['manage-users'] }, ['view-statistics']);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
