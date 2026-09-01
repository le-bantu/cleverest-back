import { ok, err, isOk, isErr, Ok, Err } from './result';

describe('Result', () => {
  it('ok() builds an Ok that unwraps to the value', () => {
    const r = ok(42);
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
    expect(r.unwrap()).toBe(42);
  });

  it('err() builds an Err that unwrapErr to the error', () => {
    const r = err(new Error('boom'));
    expect(isErr(r)).toBe(true);
    expect(r.unwrapErr().message).toBe('boom');
  });

  it('unwrap on Err throws the wrapped error', () => {
    expect(() => err(new Error('nope')).unwrap()).toThrow('nope');
  });

  it('unwrapErr on Ok throws', () => {
    expect(() => (ok(1) as Ok<number, Error>).unwrapErr()).toThrow();
  });

  it('map transforms Ok and passes Err through', () => {
    expect(
      ok(2)
        .map((n) => n * 3)
        .unwrap(),
    ).toBe(6);
    const e = err<Error, number>(new Error('x')).map((n) => n * 3);
    expect(isErr(e)).toBe(true);
  });

  it('mapErr transforms Err and passes Ok through', () => {
    const mapped = (err(new Error('a')) as Err<never, Error>).mapErr((e) => e.message);
    expect(mapped.unwrapErr()).toBe('a');
    expect(
      ok(1)
        .mapErr(() => 'y')
        .unwrap(),
    ).toBe(1);
  });
});
