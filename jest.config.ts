import type { Config } from 'jest';

const moduleNameMapper = {
  '^@shared/(.*)$': '<rootDir>/src/shared/$1',
  '^@modules/(.*)$': '<rootDir>/src/modules/$1',
};

const tsPreset = {
  preset: 'ts-jest',
  testEnvironment: 'node' as const,
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  moduleNameMapper,
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
};

const config: Config = {
  projects: [
    {
      ...tsPreset,
      displayName: 'unit',
      testMatch: ['<rootDir>/src/**/*.spec.ts'],
    },
    {
      ...tsPreset,
      displayName: 'integration',
      testMatch: ['<rootDir>/test/integration/**/*.int-spec.ts'],
      globalSetup: '<rootDir>/test/utils/global-setup.ts',
      setupFilesAfterEnv: ['<rootDir>/test/utils/setup-integration.ts'],
    },
    {
      ...tsPreset,
      displayName: 'e2e',
      testMatch: ['<rootDir>/test/e2e/**/*.e2e-spec.ts'],
      globalSetup: '<rootDir>/test/utils/global-setup.ts',
      setupFilesAfterEnv: ['<rootDir>/test/utils/setup-e2e.ts'],
    },
  ],
  collectCoverageFrom: [
    'src/modules/**/domain/**/*.ts',
    'src/modules/**/application/**/*.ts',
    'src/shared/kernel/**/*.ts',
    '!**/*.spec.ts',
    '!**/index.ts',
  ],
  coverageDirectory: '<rootDir>/coverage',
  // Aggregate thresholds per layer (DoD: domain + use cases >= 90% lines on the module).
  coverageThreshold: {
    'src/modules/identity-access/domain/': { lines: 90, statements: 88 },
    'src/modules/identity-access/application/': { lines: 90, statements: 88 },
    'src/modules/quotes/domain/': { lines: 90, statements: 90 },
    'src/modules/quotes/application/': { lines: 90, statements: 90 },
    'src/modules/contracts/domain/': { lines: 90, statements: 90 },
    'src/modules/contracts/application/': { lines: 90, statements: 90 },
    'src/modules/missions/domain/': { lines: 90, statements: 90 },
    'src/modules/missions/application/': { lines: 90, statements: 90 },
    'src/modules/deliverables/domain/': { lines: 90, statements: 90 },
    'src/modules/deliverables/application/': { lines: 90, statements: 90 },
    'src/modules/payments/domain/': { lines: 90, statements: 90 },
    'src/modules/payments/application/': { lines: 90, statements: 90 },
    'src/modules/consultant-invoices/domain/': { lines: 90, statements: 90 },
    'src/modules/consultant-invoices/application/': { lines: 90, statements: 90 },
    'src/modules/apporteurs/domain/': { lines: 90, statements: 90 },
    'src/modules/apporteurs/application/': { lines: 90, statements: 90 },
    'src/shared/kernel/': { lines: 90, statements: 90 },
  },
};

export default config;
