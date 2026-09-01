import { SystemClock, FixedClock } from './clock';

describe('SystemClock', () => {
  it('returns a Date close to now', () => {
    const before = Date.now();
    const now = new SystemClock().now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
  });
});

describe('FixedClock', () => {
  it('returns the configured instant', () => {
    const clock = new FixedClock(new Date('2026-01-01T00:00:00.000Z'));
    expect(clock.now().toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('advanceBySeconds moves the clock forward', () => {
    const clock = new FixedClock(new Date('2026-01-01T00:00:00.000Z'));
    clock.advanceBySeconds(90);
    expect(clock.now().toISOString()).toBe('2026-01-01T00:01:30.000Z');
  });

  it('set replaces the instant', () => {
    const clock = new FixedClock(new Date('2026-01-01T00:00:00.000Z'));
    clock.set(new Date('2030-06-15T12:00:00.000Z'));
    expect(clock.now().toISOString()).toBe('2030-06-15T12:00:00.000Z');
  });

  it('returns a fresh Date each call (no aliasing)', () => {
    const clock = new FixedClock(new Date('2026-01-01T00:00:00.000Z'));
    const a = clock.now();
    a.setFullYear(1999);
    expect(clock.now().getFullYear()).toBe(2026);
  });
});
