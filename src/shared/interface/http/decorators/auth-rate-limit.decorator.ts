import { SetMetadata } from '@nestjs/common';

export const AUTH_RATE_LIMITED = 'auth-rate-limited';

/**
 * Credential endpoints (login, OTP, refresh, register): on top of the global limit they
 * share the stricter `auth` budget (`AUTH_RATE_LIMIT_PER_MINUTE` per IP).
 */
export const AuthRateLimit = () => SetMetadata(AUTH_RATE_LIMITED, true);
