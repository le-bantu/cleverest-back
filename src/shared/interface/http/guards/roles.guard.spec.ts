import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

const ctxWith = (user: unknown, required: string[] | undefined): ExecutionContext => {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(required);
  const ctx = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  return Object.assign(ctx, { __reflector: reflector });
};

describe('RolesGuard', () => {
  it('allows when no roles are required', () => {
    const ctx = ctxWith({ roles: [] }, undefined);
    const guard = new RolesGuard((ctx as any).__reflector);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows when the user has one of the required roles', () => {
    const ctx = ctxWith({ roles: ['client', 'admin'] }, ['admin', 'superadmin']);
    const guard = new RolesGuard((ctx as any).__reflector);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('forbids when the user lacks every required role', () => {
    const ctx = ctxWith({ roles: ['client'] }, ['admin', 'superadmin']);
    const guard = new RolesGuard((ctx as any).__reflector);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('forbids when there is no user', () => {
    const ctx = ctxWith(undefined, ['admin']);
    const guard = new RolesGuard((ctx as any).__reflector);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
