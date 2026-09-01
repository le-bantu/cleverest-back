import { FixedClock } from '@shared/kernel';
import { RefreshToken } from './refresh-token.entity';

const at = (iso: string) => new FixedClock(new Date(iso));

const issue = (clock: FixedClock, ttlDays = 30) =>
  RefreshToken.issue({
    id: 'rt-1',
    userId: 'user-1',
    tokenHash: 'sha:abc',
    expiresAt: new Date(clock.now().getTime() + ttlDays * 24 * 3600 * 1000),
    userAgent: 'jest',
    clock,
  });

describe('RefreshToken', () => {
  it('is active while neither expired nor revoked', () => {
    const clock = at('2026-01-01T00:00:00.000Z');
    const token = issue(clock);
    expect(token.isActive(clock)).toBe(true);
  });

  it('becomes inactive once expired', () => {
    const clock = at('2026-01-01T00:00:00.000Z');
    const token = issue(clock, 1);
    clock.advanceBySeconds(24 * 3600 + 1);
    expect(token.isExpired(clock)).toBe(true);
    expect(token.isActive(clock)).toBe(false);
  });

  it('revoke() is idempotent and disables the token', () => {
    const clock = at('2026-01-01T00:00:00.000Z');
    const token = issue(clock);
    token.revoke(clock);
    const first = token.revokedAt;
    clock.advanceBySeconds(10);
    token.revoke(clock);
    expect(token.revokedAt).toBe(first);
    expect(token.isActive(clock)).toBe(false);
  });
});
