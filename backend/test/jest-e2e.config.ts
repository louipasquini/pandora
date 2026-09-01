import type { Config } from 'jest';

/**
 * Testes e2e (`*.e2e-spec.ts` em test/). Rodam contra PostgreSQL real:
 * globalSetup cria um schema isolado por execução, globalTeardown o destrói.
 */
const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '..',
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  testEnvironment: 'node',
  globalSetup: '<rootDir>/test/setup-db.ts',
  globalTeardown: '<rootDir>/test/teardown-db.ts',
  testTimeout: 30000,
  maxWorkers: 2,
};

export default config;
