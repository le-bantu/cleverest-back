import { validateEnv } from './env.schema';

const base = {
  DATABASE_URL: 'postgresql://x',
  JWT_ACCESS_SECRET: 'dev-access-secret-change-me',
  JWT_REFRESH_SECRET: 'dev-refresh-secret-change-me',
};
const strong = (c: string) => c.repeat(40);

describe('validateEnv', () => {
  it('development accepts the dev defaults; security settings have safe defaults', () => {
    const env = validateEnv(base);
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      CORS_ORIGINS: '',
      TRUST_PROXY: 0,
      RATE_LIMIT_PER_MINUTE: 300,
      AUTH_RATE_LIMIT_PER_MINUTE: 10,
    });
    expect(env.SWAGGER_ENABLED).toBeUndefined();
    expect(validateEnv({ ...base, SWAGGER_ENABLED: 'false' }).SWAGGER_ENABLED).toBe(false);
  });

  it('production refuses weak, default or shared JWT secrets', () => {
    const prod = { ...base, NODE_ENV: 'production' };
    expect(() => validateEnv(prod)).toThrow(/JWT_ACCESS_SECRET.*\n.*JWT_REFRESH_SECRET/);
    expect(() =>
      validateEnv({ ...prod, JWT_ACCESS_SECRET: strong('a'), JWT_REFRESH_SECRET: strong('a') }),
    ).toThrow(/must differ/);
    expect(
      validateEnv({ ...prod, JWT_ACCESS_SECRET: strong('a'), JWT_REFRESH_SECRET: strong('b') })
        .NODE_ENV,
    ).toBe('production');
  });

  it('production refuses the drivers that are not implemented yet', () => {
    const prod = {
      ...base,
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: strong('a'),
      JWT_REFRESH_SECRET: strong('b'),
    };
    expect(() => validateEnv({ ...prod, STORAGE_DRIVER: 's3' })).toThrow(/STORAGE_DRIVER/);
    expect(() => validateEnv({ ...prod, MAIL_DRIVER: 'smtp' })).toThrow(/MAIL_DRIVER/);
  });

  it('reports every invalid key', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL[\s\S]*JWT_ACCESS_SECRET/);
  });
});
