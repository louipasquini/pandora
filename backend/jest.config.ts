import type { Config } from 'jest';

/** Testes unitários (`*.spec.ts` em src/). Sem banco. */
const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
  },
  collectCoverageFrom: ['**/*.ts', '!**/*.spec.ts', '!**/*.module.ts'],
  coverageDirectory: '../coverage/unit',
  testEnvironment: 'node',
};

export default config;
