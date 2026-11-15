import { INestApplication, RequestMethod } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import request from 'supertest';
import { getOptionsToken } from '@nestjs/throttler';
import { throttlerOptions } from '../../src/shared/infrastructure/security/rate-limit.module';
import { createTestApp } from '../utils/http-app';
import { getTestPrisma } from '../utils/test-db';
import { seedActors } from '../fixtures/actors';
import { IS_PUBLIC_KEY } from '../../src/shared/interface/http/decorators/public.decorator';
import { ROLES_KEY } from '../../src/shared/interface/http/decorators/roles.decorator';
import { AUTH_RATE_LIMITED } from '../../src/shared/interface/http/decorators/auth-rate-limit.decorator';
import { buildOpenApiDocument } from '../../src/shared/interface/http/configure-app';

interface Route {
  method: string;
  path: string;
  isPublic: boolean;
  roles: string[] | undefined;
  authLimited: boolean;
}

/** Every HTTP route of the app with its access metadata (handler overrides controller). */
const routesOf = (app: INestApplication): Route[] => {
  const routes: Route[] = [];
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const ctrl = wrapper.metatype as (new (...args: unknown[]) => unknown) | undefined;
      if (!ctrl) continue;
      const base = String(Reflect.getMetadata(PATH_METADATA, ctrl) ?? '');
      const names = new Set<string>();
      for (
        let p = ctrl.prototype as object | null;
        p && p !== Object.prototype;
        p = Object.getPrototypeOf(p) as object | null
      )
        Object.getOwnPropertyNames(p).forEach((n) => names.add(n));
      for (const name of names) {
        const handler = (ctrl.prototype as Record<string, unknown>)[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const sub = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        if (sub === undefined) continue;
        const meta = <T>(key: string): T | undefined =>
          (Reflect.getMetadata(key, handler) ?? Reflect.getMetadata(key, ctrl)) as T | undefined;
        routes.push({
          method: RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as number],
          path: `/${[base, sub].filter((p) => p && p !== '/').join('/')}`.replace(/\/+/g, '/'),
          isPublic: meta<boolean>(IS_PUBLIC_KEY) === true,
          roles: meta<string[]>(ROLES_KEY),
          authLimited: Reflect.getMetadata(AUTH_RATE_LIMITED, handler) === true,
        });
      }
    }
  }
  return routes;
};

const key = (r: Route) => `${r.method} ${r.path}`;

describe('security (e2e)', () => {
  let app: INestApplication;
  let close: () => Promise<void>;

  beforeAll(async () => {
    // production budgets would be hit by the suite itself; here: 3 credential calls per minute
    ({ app, close } = await createTestApp((b) =>
      b.overrideProvider(getOptionsToken()).useValue(throttlerOptions(1000, 3)),
    ));
    await seedActors(getTestPrisma());
  });
  afterAll(() => close());

  const api = () => request(app.getHttpServer());

  it('every non-public route declares its roles, except the "any signed-in user" allowlist', () => {
    const routes = routesOf(app);
    expect(routes.length).toBeGreaterThan(100);
    const open = routes
      .filter((r) => !r.isPublic && !r.roles)
      .map(key)
      .sort();
    expect(open).toEqual([
      'GET /auth/me',
      'GET /me',
      'GET /users/:id', // self or admin, enforced by GetUserUseCase
      'PATCH /me/2fa',
      'PATCH /me/deactivate',
      'POST /auth/logout',
      'PUT /me',
      'PUT /users/:id', // self or admin, enforced by UpdateUserUseCase
    ]);
    expect(
      routes
        .filter((r) => r.isPublic)
        .map(key)
        .sort(),
    ).toEqual([
      'GET /health',
      'POST /auth/login',
      'POST /auth/otp/resend',
      'POST /auth/otp/verify',
      'POST /auth/refresh',
      'POST /auth/register',
    ]);
    // every public credential endpoint is under the strict auth budget
    expect(
      routes.filter((r) => r.isPublic && r.path.startsWith('/auth') && !r.authLimited),
    ).toEqual([]);
  });

  it('the OpenAPI document lists every route; protected operations require the bearer token', () => {
    const doc = buildOpenApiDocument(app);
    const ops = Object.entries(doc.paths).flatMap(([path, item]) =>
      Object.entries(item as Record<string, { security?: unknown[]; tags?: string[] }>).map(
        ([method, op]) => ({
          key: `${method.toUpperCase()} ${path.replace(/^\/api/, '').replace(/\{(\w+)\}/g, ':$1')}`,
          op,
        }),
      ),
    );
    const routes = routesOf(app);
    expect(ops.map((o) => o.key).sort()).toEqual(routes.map(key).sort());
    for (const { key: k, op } of ops) {
      expect({ k, tagged: (op.tags ?? []).length > 0 }).toEqual({ k, tagged: true });
      const route = routes.find((r) => key(r) === k)!;
      if (!route.isPublic)
        expect({ k, secured: !!op.security?.length }).toEqual({ k, secured: true });
    }
  });

  it('security headers are set and the framework is not advertised', async () => {
    const res = await api().get('/api/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'up' });
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
  });

  it('no CORS unless origins are configured', async () => {
    const res = await api().get('/api/health').set('Origin', 'https://evil.test');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('brute force on login is cut at AUTH_RATE_LIMIT_PER_MINUTE (429), other routes unaffected', async () => {
    const attempt = () =>
      api().post('/api/auth/login').send({ email: 'client@e2e.test', password: 'wrong-password' });
    for (let i = 0; i < 3; i++) await attempt().expect(401);
    const blocked = await attempt().expect(429);
    expect(blocked.body).toMatchObject({ statusCode: 429 });
    expect(blocked.headers['retry-after-auth']).toBeDefined();
    // the budget is per IP and per endpoint: other routes still answer
    await api().post('/api/auth/register').send({}).expect(400);
    await api().get('/api/health').expect(200);
  });
});
