import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  API_PREFIX: z.string().default('api'),
  /** comma-separated allowed origins; empty = CORS disabled (same-origin only) */
  CORS_ORIGINS: z.string().default(''),
  /** Express `trust proxy` (hops in front of the app); 0 = the socket address is the client IP */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  /** Swagger UI at /<prefix>/docs; off by default in production */
  SWAGGER_ENABLED: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  /** requests per minute and per IP, every route */
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(300),
  /** requests per minute and per IP on login / OTP / refresh / register */
  AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),

  DATABASE_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(8),
  JWT_ACCESS_TTL: z.string().default('900s'),
  JWT_REFRESH_SECRET: z.string().min(8),
  JWT_REFRESH_TTL: z.string().default('30d'),

  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_ROOT: z.string().default('./storage'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  MAIL_DRIVER: z.enum(['log', 'smtp']).default('log'),
  MAIL_FROM: z.string().default('no-reply@cleverest.local'),

  SEED_SUPERADMIN_EMAIL: z.string().email().default('superadmin@cleverest.local'),
  SEED_SUPERADMIN_PASSWORD: z.string().min(8).default('ChangeMe!2026'),
});

const DEV_SECRETS = new Set(['dev-access-secret-change-me', 'dev-refresh-secret-change-me']);

/** Production refuses weak or shared JWT secrets and unimplemented drivers. */
export const productionSchema = envSchema.superRefine((env, ctx) => {
  if (env.NODE_ENV !== 'production') return;
  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    if (env[key].length < 32 || DEV_SECRETS.has(env[key]))
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message: 'must be a random secret of 32+ chars',
      });
  }
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET)
    ctx.addIssue({
      code: 'custom',
      path: ['JWT_REFRESH_SECRET'],
      message: 'must differ from JWT_ACCESS_SECRET',
    });
  if (env.STORAGE_DRIVER === 's3')
    ctx.addIssue({
      code: 'custom',
      path: ['STORAGE_DRIVER'],
      message: 's3 is not implemented yet',
    });
  if (env.MAIL_DRIVER === 'smtp')
    ctx.addIssue({ code: 'custom', path: ['MAIL_DRIVER'], message: 'smtp is not implemented yet' });
});

export type Env = z.infer<typeof envSchema>;

export const validateEnv = (config: Record<string, unknown>): Env => {
  const parsed = productionSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
};
