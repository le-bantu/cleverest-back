import { ExecutionContext, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerModuleOptions } from '@nestjs/throttler';
import type { Env } from '../config/env.schema';
import { AUTH_RATE_LIMITED } from '../../interface/http/decorators/auth-rate-limit.decorator';

const MINUTE_MS = 60_000;

const isAuthRoute = (ctx: ExecutionContext): boolean =>
  Reflect.getMetadata(AUTH_RATE_LIMITED, ctx.getHandler()) === true;

/** Global budget on every route + a stricter `auth` budget on `@AuthRateLimit()` routes. */
export const throttlerOptions = (
  perMinute: number,
  authPerMinute: number,
): ThrottlerModuleOptions => ({
  errorMessage: 'Too many requests, retry later',
  throttlers: [
    { name: 'default', ttl: MINUTE_MS, limit: perMinute },
    { name: 'auth', ttl: MINUTE_MS, limit: authPerMinute, skipIf: (ctx) => !isAuthRoute(ctx) },
  ],
});

/** In-memory, per instance (enough for one node; use a shared store when scaling out). */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        throttlerOptions(
          config.get('RATE_LIMIT_PER_MINUTE', { infer: true }),
          config.get('AUTH_RATE_LIMIT_PER_MINUTE', { infer: true }),
        ),
    }),
  ],
  exports: [ThrottlerModule],
})
export class RateLimitModule {}
