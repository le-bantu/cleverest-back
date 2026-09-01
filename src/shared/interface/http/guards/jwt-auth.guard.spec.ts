import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';

const config = { get: () => 'test-access-secret' } as any;

const contextFor = (headers: Record<string, string>, isPublic = false) => {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(isPublic);
  const request: any = { headers };
  const ctx = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { reflector, request, ctx };
};

describe('JwtAuthGuard', () => {
  const jwt = new JwtService({ secret: 'test-access-secret' });

  it('lets @Public() routes through without a token', async () => {
    const { reflector, ctx } = contextFor({}, true);
    const guard = new JwtAuthGuard(jwt, reflector, config);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('rejects a request with no Authorization header', async () => {
    const { reflector, ctx } = contextFor({});
    const guard = new JwtAuthGuard(jwt, reflector, config);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const bad = new JwtService({ secret: 'other' }).sign({ sub: 'u1', type: 'access' });
    const { reflector, ctx } = contextFor({ authorization: `Bearer ${bad}` });
    const guard = new JwtAuthGuard(jwt, reflector, config);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a refresh token used as access token', async () => {
    const token = jwt.sign({ sub: 'u1', type: 'refresh' });
    const { reflector, ctx } = contextFor({ authorization: `Bearer ${token}` });
    const guard = new JwtAuthGuard(jwt, reflector, config);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('accepts a valid access token and attaches the user', async () => {
    const token = jwt.sign({
      sub: 'u1',
      email: 'a@b.c',
      roles: ['client'],
      permissions: ['manage-users'],
      type: 'access',
    });
    const { reflector, request, ctx } = contextFor({ authorization: `Bearer ${token}` });
    const guard = new JwtAuthGuard(jwt, reflector, config);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toEqual({
      userId: 'u1',
      email: 'a@b.c',
      roles: ['client'],
      permissions: ['manage-users'],
    });
  });
});
