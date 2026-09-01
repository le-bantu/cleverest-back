import { ConflictException, NotFoundException } from '@shared/kernel';
import { VerifyOtpUseCase } from './verify-otp.use-case';
import { ResendOtpUseCase } from './resend-otp.use-case';
import { SessionIssuerService } from '../services/session-issuer.service';
import {
  InMemoryUserRepository,
  InMemoryOtpChallengeRepository,
  InMemoryRefreshTokenRepository,
  fakeConfig,
} from '../../testing/in-memory-repos';
import { FakeHasher, FakeRoleCatalog, FakeTokenIssuer, FakeOtpSender } from '../../testing/fakes';
import { buildUser, testClock } from '../../testing/builders';
import { OtpChallenge, OtpCode } from '../../domain';

const base = async () => {
  const users = new InMemoryUserRepository();
  const otps = new InMemoryOtpChallengeRepository();
  const refresh = new InMemoryRefreshTokenRepository();
  const clock = testClock();
  const hasher = new FakeHasher();
  const user = await buildUser({ email: 'a@x.com', twoFactor: true });
  users.store.set(user.id, user);
  const challenge = await OtpChallenge.issue({
    id: 'ch-1',
    userId: user.id,
    code: OtpCode.create('123456'),
    hasher,
    clock,
    ttlSeconds: 300,
  });
  await otps.save(challenge);
  return { users, otps, refresh, clock, hasher, user };
};

describe('VerifyOtpUseCase', () => {
  const mk = (d: Awaited<ReturnType<typeof base>>) =>
    new VerifyOtpUseCase(
      d.otps,
      d.users,
      d.hasher,
      d.clock,
      new SessionIssuerService(new FakeTokenIssuer(), new FakeRoleCatalog(), d.refresh, d.clock),
      fakeConfig() as never,
    );

  it('exchanges a valid code for tokens', async () => {
    const d = await base();
    const res = await mk(d).execute({ challengeId: 'ch-1', code: '123456' });
    expect(res.accessToken).toContain('access:');
    expect(d.refresh.store.size).toBe(1);
  });

  it('rejects a wrong code and persists the attempt', async () => {
    const d = await base();
    await expect(mk(d).execute({ challengeId: 'ch-1', code: '000000' })).rejects.toMatchObject({
      code: 'OTP_INVALID',
    });
    expect((await d.otps.findById('ch-1'))?.attempts).toBe(1);
  });

  it('404 on an unknown challenge', async () => {
    const d = await base();
    await expect(mk(d).execute({ challengeId: 'zzz', code: '123456' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects an expired challenge', async () => {
    const d = await base();
    d.clock.advanceBySeconds(301);
    await expect(mk(d).execute({ challengeId: 'ch-1', code: '123456' })).rejects.toMatchObject({
      code: 'OTP_EXPIRED',
    });
  });
});

describe('ResendOtpUseCase', () => {
  const mk = (d: Awaited<ReturnType<typeof base>>, sender: FakeOtpSender) =>
    new ResendOtpUseCase(
      d.otps,
      d.users,
      sender as never,
      d.hasher,
      d.clock,
      fakeConfig() as never,
    );

  it('issues a fresh challenge after the cooldown', async () => {
    const d = await base();
    const sender = new FakeOtpSender();
    d.clock.advanceBySeconds(61);
    const res = await mk(d, sender).execute({ challengeId: 'ch-1' });
    expect(res.challengeId).not.toBe('ch-1');
    expect(sender.sent).toHaveLength(1);
  });

  it('is rate-limited before the cooldown elapses', async () => {
    const d = await base();
    await expect(mk(d, new FakeOtpSender()).execute({ challengeId: 'ch-1' })).rejects.toMatchObject(
      {
        code: 'OTP_RESEND_TOO_SOON',
      },
    );
  });

  it('rejects res* on a consumed challenge', async () => {
    const d = await base();
    const challenge = await d.otps.findById('ch-1');
    await challenge!.verify('123456', d.hasher, d.clock, 5);
    await d.otps.save(challenge!);
    await expect(
      mk(d, new FakeOtpSender()).execute({ challengeId: 'ch-1' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
