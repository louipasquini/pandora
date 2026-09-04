import type { Config } from 'jest';

/**
 * Testes e2e (`*.e2e-spec.ts` em test/). Rodam contra PostgreSQL real:
 * globalSetup cria um schema isolado **por execução** (não por worker) e todos
 * os workers o compartilham. Como `rbac.e2e-spec.ts` e `clientes.e2e-spec.ts`
 * escrevem as MESMAS tabelas de RBAC e cada um limpa no `afterEach`, rodá-los em
 * paralelo faz um apagar as linhas do outro no meio do teste (visto na CI). Daí
 * `maxWorkers: 1` — serializa os arquivos e cada `afterEach` fica isolado no
 * tempo. O custo é ~12 s; a alternativa (schema por worker) mudaria o harness da
 * spec 004. Mantido em 1 propositalmente — não subir, mesmo por performance.
 *
 * `workerIdleMemoryLimit`: como cada spec faz bootstrap completo do Nest,
 * reinicia o único worker se ele crescer demais entre arquivos — nativo do
 * Jest, cross-platform, não interfere na serialização acima.
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
  maxWorkers: 1,
  workerIdleMemoryLimit: '768MB',
};

export default config;
