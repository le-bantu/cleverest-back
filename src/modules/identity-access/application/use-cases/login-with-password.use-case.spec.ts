import { UnauthorizedException } from '@shared/kernel';
import { LoginWithPasswordUseCase } from './login-with-password.use-case';
import { SessionIssuerService } from '../services/session-issuer.service';
import {
  InMemoryUserRepository,
  InMemoryOtpChallengeRepository,
  InMemoryRefreshTokenRepository,
  fakeConfig,
} from '../../testing/in-memory-repos';
import { FakeHasher, FakeRoleCatalog, FakeTokenIssuer, FakeOtpSender } from '../../testing/fakes';
import { buildUser, testClock } from '../../testing/builders';
import { User } from '../../domain';

const setup = async (userOverrides: Parameters<typeof buildUser>[0] = {}) => {
  const users = new InMemoryUserRepository();
  const otps = new InMemoryOtpChallengeRepository();
  const refresh = new InMemoryRefreshTokenRepository();
  const clock = testClock();
  const hasher = new FakeHasher();
  const otpSender = new FakeOtpSender();
  const roleCatalog = new FakeRoleCatalog({ client: ['view-dashboard'] });
  const session = new SessionIssuerService(new FakeTokenIssuer(), roleCatalog, refresh, clock);
  const uc = new LoginWithPasswordUseCase(
    users,
    hasher,
    otps,
    otpSender,
    clock,
    session,
    fakeConfig() as never,
  );
  const user = await buildUser({ email: 'a@x.com', password: 'secret12', ...userOverrides });
  users.store.set(user.id, user);
  return { uc, users, otps, refresh, otpSender, user };
};

describe('LoginWithPasswordUseCase', () => {
  it('returns a token pair on correct credentials without 2FA', async () => {
    const { uc, refresh } = await setup();
    const res = await uc.execute({ email: 'a@x.com', password: 'secret12' });
    if (res.otpRequired) throw new Error('unexpected otp');
    expect(res.accessToken).toContain('access:');
    expect(res.user.permissions).toContain('view-dashboard');
    expect(refresh.store.size).toBe(1);
  });

  it('rejects a wrong password with INVALID_CREDENTIALS', async () => {
    const { uc } = await setup();
    await expect(uc.execute({ email: 'a@x.com', password: 'nope' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('rejects an unknown email with INVALID_CREDENTIALS (no user enumeration)', async () => {
    const { uc } = await setup();
    await expect(uc.execute({ email: 'ghost@x.com', password: 'secret12' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('rejects an inactive account', async () => {
    const { uc } = await setup({ active: false });
    await expect(uc.execute({ email: 'a@x.com', password: 'secret12' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('when 2FA is on, returns otpRequired + challengeId and sends the code', async () => {
    const { uc, otps, otpSender } = await setup({ twoFactor: true });
    const res = await uc.execute({ email: 'a@x.com', password: 'secret12' });
    expect(res).toMatchObject({ otpRequired: true });
    if (!res.otpRequired) throw new Error('expected otp');
    expect(otps.store.has(res.challengeId)).toBe(true);
    expect(otpSender.sent).toHaveLength(1);
  });

  it('upgrades a legacy bcrypt hash to argon2 on successful login', async () => {
    const { uc, users } = await setup();
    const legacy = User.reconstitute('legacy-1', {
      email: (await buildUser({ email: 'legacy@x.com' })).email,
      phone: null,
      passwordHash: 'bcrypt:secret12',
      isActive: true,
      twoFactorEnabled: false,
      emailVerifiedAt: null,
      roles: new Set(['client'] as never),
      directPermissions: new Set(),
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      profile: null,
    });
    users.store.set(legacy.id, legacy);
    await uc.execute({ email: 'legacy@x.com', password: 'secret12' });
    expect((await users.findById('legacy-1'))?.passwordHash).toBe('argon:secret12');
  });
});
