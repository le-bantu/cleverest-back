import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../src/shared/infrastructure/database/prisma.service';
import { PrismaRoleCatalog } from '../../src/modules/identity-access/infrastructure/persistence/prisma-role-catalog';
import { Argon2PasswordHasher } from '../../src/modules/identity-access/infrastructure/security/argon2-password-hasher';
import {
  JwtTokenIssuer,
  parseDurationSeconds,
} from '../../src/modules/identity-access/infrastructure/security/jwt-token-issuer';
import { getTestPrisma } from '../utils/test-db';
import { seedRbac } from '../fixtures/seed-rbac';

describe('security + catalog adapters (integration)', () => {
  const prisma = new PrismaService();
  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());

  it('Argon2PasswordHasher round-trips argon2 and verifies legacy bcrypt', async () => {
    const hasher = new Argon2PasswordHasher();
    const argonHash = await hasher.hash('S3cret-pass');
    expect(argonHash.startsWith('$argon2')).toBe(true);
    expect(await hasher.verify('S3cret-pass', argonHash)).toBe(true);
    expect(await hasher.verify('wrong', argonHash)).toBe(false);
    expect(hasher.needsRehash(argonHash)).toBe(false);

    const bcryptHash = bcrypt.hashSync('S3cret-pass', 8).replace('$2b$', '$2y$');
    expect(await hasher.verify('S3cret-pass', bcryptHash)).toBe(true);
    expect(hasher.needsRehash(bcryptHash)).toBe(true);
  });

  it('parseDurationSeconds understands s/m/h/d and bare numbers', () => {
    expect(parseDurationSeconds('900s')).toBe(900);
    expect(parseDurationSeconds('15m')).toBe(900);
    expect(parseDurationSeconds('2h')).toBe(7200);
    expect(parseDurationSeconds('1d')).toBe(86400);
    expect(parseDurationSeconds('120')).toBe(120);
  });

  it('JwtTokenIssuer issues a verifiable access token and a hashable refresh token', async () => {
    const config = new ConfigService({
      JWT_ACCESS_SECRET: 'test-access-secret-xyz',
      JWT_ACCESS_TTL: '900s',
      JWT_REFRESH_SECRET: 'test-refresh-secret-xyz',
      JWT_REFRESH_TTL: '30d',
    });
    const jwt = new JwtService({});
    const issuer = new JwtTokenIssuer(jwt, config as never);

    const access = await issuer.issueAccessToken({
      userId: 'u1',
      email: 'u1@x.com',
      roles: ['client'],
      permissions: ['view-dashboard'],
    });
    const decoded = jwt.verify(access.token, { secret: 'test-access-secret-xyz' }) as Record<
      string,
      unknown
    >;
    expect(decoded).toMatchObject({ sub: 'u1', type: 'access', permissions: ['view-dashboard'] });
    expect(access.expiresInSeconds).toBe(900);

    const refresh = await issuer.issueRefreshToken('u1');
    expect(refresh.token.startsWith('u1.')).toBe(true);
    expect(issuer.hashRefreshToken(refresh.token)).toBe(refresh.tokenHash);
    expect(refresh.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('PrismaRoleCatalog expands role -> permissions from the DB', async () => {
    await seedRbac(getTestPrisma());
    const catalog = new PrismaRoleCatalog(prisma);
    expect(await catalog.roleExists('superadmin')).toBe(true);
    expect(await catalog.roleExists('nope')).toBe(false);
    const perms = await catalog.permissionsForRoles(['superadmin']);
    expect(perms).toEqual(expect.arrayContaining(['manage-users', 'view-statistics']));
    expect(await catalog.permissionsForRoles(['admin'])).toEqual([]);
  });
});
