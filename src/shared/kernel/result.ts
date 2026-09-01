/**
 * Minimal Result / Either type for the domain and application layers.
 * Framework-free on purpose.
 */
export type Result<T, E = Error> = Ok<T, E> | Err<T, E>;

export class Ok<T, E> {
  readonly isOk = true as const;
  readonly isErr = false as const;

  constructor(readonly value: T) {}

  unwrap(): T {
    return this.value;
  }

  unwrapErr(): E {
    throw new Error('Called unwrapErr on an Ok result');
  }

  map<U>(fn: (value: T) => U): Result<U, E> {
    return new Ok(fn(this.value));
  }

  mapErr<F>(_fn: (error: E) => F): Result<T, F> {
    return new Ok<T, F>(this.value);
  }
}

export class Err<T, E> {
  readonly isOk = false as const;
  readonly isErr = true as const;

  constructor(readonly error: E) {}

  unwrap(): T {
    throw this.error instanceof Error ? this.error : new Error(String(this.error));
  }

  unwrapErr(): E {
    return this.error;
  }

  map<U>(_fn: (value: T) => U): Result<U, E> {
    return new Err<U, E>(this.error);
  }

  mapErr<F>(fn: (error: E) => F): Result<T, F> {
    return new Err<T, F>(fn(this.error));
  }
}

export const ok = <T, E = never>(value: T): Result<T, E> => new Ok<T, E>(value);
export const err = <E, T = never>(error: E): Result<T, E> => new Err<T, E>(error);

export const isOk = <T, E>(result: Result<T, E>): result is Ok<T, E> => result.isOk;
export const isErr = <T, E>(result: Result<T, E>): result is Err<T, E> => result.isErr;
