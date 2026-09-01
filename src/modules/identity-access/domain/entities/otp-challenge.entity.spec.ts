import { FixedClock, UnauthorizedException, ConflictException } from '@shared/kernel';
import { OtpChallenge } from './otp-challenge.entity';
import { OtpCode } from '../value-objects/otp-code.vo';
import { FakeHasher } from '../../testing/fakes';

const hasher = new FakeHasher();

const issue = async (clock: FixedClock, ttl = 300) =>
  OtpChallenge.issue({
    id: 'otp-1',
    userId: 'user-1',
    code: OtpCode.create('123456'),
    hasher,
    clock,
    ttlSeconds: ttl,
  });

describe('OtpChallenge', () => {
  it('issues a hashed, unconsumed challenge expiring after ttl', async () => {
    const clock = new FixedClock(new Date('2026-01-01T00:00:00.000Z'));
    const otp = await issue(clock, 300);
    expect(otp.codeHash).toBe('argon:123456');
    expect(otp.isConsumed()).toBe(false);
    expect(otp.isExpired(clock)).toBe(false);
    clock.advanceBySeconds(300);
    expect(otp.isExpired(clock)).toBe(true);
  });

  it('verify() consumes the challenge on the correct code', async () => {
    const clock = new FixedClock(new Date('2026-01-01T00:00:00.000Z'));
    const otp = await issue(clock);
    await otp.verify('123456', hasher, clock, 5);
    expect(otp.isConsumed()).toBe(true);
  });

  it('verify() counts a failed attempt and throws OTP_INVALID on a wrong code', async () => {
    const clock = new FixedClock(new Date('2026-01-01T00:00:00.000Z'));
    const otp = await issue(clock);
    await expect(otp.verify('000000', hasher, clock, 5)).rejects.toMatchObject({
      code: 'OTP_INVALID',
    });
    expect(otp.attempts).toBe(1);
  });

  it('verify() throws OTP_MAX_ATTEMPTS once the limit is reached', async () => {
    const clock = new FixedClock(new Date('2026-01-01T00:00:00.000Z'));
    const otp = await issue(clock);
    for (let i = 0; i < 3; i++) {
      await expect(otp.verify('000000', hasher, clock, 3)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
    await expect(otp.verify('123456', hasher, clock, 3)).rejects.toMatchObject({
      code: 'OTP_MAX_ATTEMPTS',
    });
  });

  it('verify() throws OTP_EXPIRED after the ttl', async () => {
    const clock = new FixedClock(new Date('2026-01-01T00:00:00.000Z'));
    const otp = await issue(clock, 60);
    clock.advanceBySeconds(61);
    await expect(otp.verify('123456', hasher, clock, 5)).rejects.toMatchObject({
      code: 'OTP_EXPIRED',
    });
  });

  it('verify() throws OTP_ALREADY_USED on a consumed challenge', async () => {
    const clock = new FixedClock(new Date('2026-01-01T00:00:00.000Z'));
    const otp = await issue(clock);
    await otp.verify('123456', hasher, clock, 5);
    await expect(otp.verify('123456', hasher, clock, 5)).rejects.toBeInstanceOf(ConflictException);
  });
});
