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
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json', isolatedModules: true }],
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
  coverageThreshold: {
    'src/modules/**/domain/**/*.ts': { lines: 90, statements: 85 },
    'src/modules/**/application/**/*.ts': { lines: 90, statements: 85 },
  },
};

export default config;
