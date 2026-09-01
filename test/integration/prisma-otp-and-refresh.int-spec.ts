import { FixedClock } from '../../src/shared/kernel';
import { PrismaService } from '../../src/shared/infrastructure/database/prisma.service';
import { PrismaUserRepository } from '../../src/modules/identity-access/infrastructure/persistence/prisma-user.repository';
import { PrismaOtpChallengeRepository } from '../../src/modules/identity-access/infrastructure/persistence/prisma-otp-challenge.repository';
import { PrismaRefreshTokenRepository } from '../../src/modules/identity-access/infrastructure/persistence/prisma-refresh-token.repository';
import {
  Email,
  OtpChallenge,
  OtpCode,
  RefreshToken,
  RoleName,
  User,
} from '../../src/modules/identity-access/domain';
import { FakeHasher } from '../../src/modules/identity-access/testing/fakes';
import { getTestPrisma } from '../utils/test-db';
import { seedRbac } from '../fixtures/seed-rbac';

const clock = new FixedClock(new Date('2026-01-01T00:00:00.000Z'));

describe('OTP + refresh-token repositories (integration)', () => {
  const prisma = new PrismaService();
  const users = new PrismaUserRepository(prisma);
  const otps = new PrismaOtpChallengeRepository(prisma);
  const refreshTokens = new PrismaRefreshTokenRepository(prisma);

  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());

  let userId: string;
  beforeEach(async () => {
    await seedRbac(getTestPrisma());
    const user = User.register(
      {
        id: users.nextIdentity(),
        email: Email.create('otp@example.com'),
        passwordHash: 'argon:h',
        role: RoleName.CLIENT,
      },
      clock,
    );
    await users.save(user);
    userId = user.id;
  });

  it('persists an OTP challenge and finds the latest pending one', async () => {
    const challenge = await OtpChallenge.issue({
      id: otps.nextIdentity(),
      userId,
      code: OtpCode.create('123456'),
      hasher: new FakeHasher(),
      clock,
      ttlSeconds: 300,
    });
    await otps.save(challenge);

    const pending = await otps.findLatestPending(userId, 'LOGIN');
    expect(pending?.id).toBe(challenge.id);

    challenge.registerFailedAttempt();
    challenge.consume(clock);
    await otps.save(challenge);

    expect((await otps.findById(challenge.id))?.attempts).toBe(1);
    expect(await otps.findLatestPending(userId, 'LOGIN')).toBeNull();
  });

  it('stores a refresh token, looks it up by hash and revokes all for a user', async () => {
    const token = RefreshToken.issue({
      id: refreshTokens.nextIdentity(),
      userId,
      tokenHash: 'hash-abc',
      expiresAt: new Date(clock.now().getTime() + 3_600_000),
      userAgent: 'jest',
      clock,
    });
    await refreshTokens.save(token);

    const found = await refreshTokens.findByTokenHash('hash-abc');
    expect(found?.userId).toBe(userId);
    expect(found?.isActive(clock)).toBe(true);

    await refreshTokens.revokeAllForUser(userId);
    expect((await refreshTokens.findByTokenHash('hash-abc'))?.isRevoked()).toBe(true);
  });
});
