import type { Config } from 'jest';

/**
 * Testes unitários (`*.spec.ts` em src/). Sem banco.
 *
 * `isolatedModules: true` faz o ts-jest só transpilar cada arquivo (sem checar
 * tipos), o que é bem mais rápido/leve em CPU numa suíte grande. A checagem de
 * tipos completa não desaparece — ela mora em `npm run typecheck` (`tsc --noEmit`,
 * já rodado no CI). Não aplicar isto no `jest-e2e.config.ts`: os specs e2e fazem
 * bootstrap completo do Nest, e `emitDecoratorMetadata` depende de checagem de
 * tipo cruzada entre arquivos para os decorators de DI resolverem certo — sem
 * isso o risco de metadata de decorator quebrar silenciosamente é maior.
 *
 * `maxWorkers`/`workerIdleMemoryLimit`: uma suíte grande sem limite de workers
 * pode disparar 1 processo ts-jest por núcleo simultaneamente — já visto travar
 * a máquina inteira (RAM+swap esgotados antes do OOM killer do SO agir). `50%`
 * escala com o hardware de quem estiver rodando (qualquer SO — é lido em JS,
 * não em sintaxe de shell); para forçar um número fixo, defina a env var
 * `JEST_MAX_WORKERS` (ex.: `JEST_MAX_WORKERS=2 npm test`, ou `set` no
 * cmd.exe / `$env:` no PowerShell). `workerIdleMemoryLimit` reinicia um worker
 * que cresceu demais entre arquivos de teste — protege contra vazamento
 * acumulado numa suíte longa, também nativo do Jest, sem SO envolvido.
 */
const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      { tsconfig: '<rootDir>/../tsconfig.json', isolatedModules: true },
    ],
  },
  collectCoverageFrom: ['**/*.ts', '!**/*.spec.ts', '!**/*.module.ts'],
  coverageDirectory: '../coverage/unit',
  testEnvironment: 'node',
  maxWorkers: process.env.JEST_MAX_WORKERS || '50%',
  workerIdleMemoryLimit: '512MB',
};

export default config;
