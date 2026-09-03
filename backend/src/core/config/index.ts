import type { ConfigService } from '@nestjs/config';
import { accountConfig, type AppConfig } from '../../config/env.schema';

/**
 * Contrato de configuração do `core` (Padrão Transversal "config/segredos").
 *
 * A validação continua em `backend/src/config/` (schema zod + `ConfigModule`,
 * spec 001): `.env` da raiz → `envSchema.parse` no boot → processo aborta
 * nomeando a variável ausente/malformada, sem default silencioso para segredo
 * ou string de conexão. Esta spec (002) apenas torna o `core` o **dono do
 * contrato**: os contextos importam os tipos e o acessor daqui, e a regra ESLint
 * `no-restricted-syntax` barra `process.env` fora de `src/config`, `src/core` e
 * `src/main.ts`.
 *
 * Fluxo de leitura num contexto:
 *
 *   constructor(private readonly cfg: ConfigService<AppConfig, true>) {}
 *   ...
 *   const url = this.cfg.get('DATABASE_URL', { infer: true });
 *   // fatia de uma conta de origem (as 3 chaves agrupadas, ou undefined):
 *   const guru = accountConfig(this.cfg.getOrThrow('config', { infer: true }) as AppConfig,
 *                              PlataformaOrigem.GURU_PRD);
 *
 * (Na prática cada contexto encapsula isso num provider tipado seu; o `core`
 * fixa apenas os tipos e a função `accountConfig`.)
 */
export type { AppConfig };
export { accountConfig };

/** Assinatura tipada de leitura de config (config já validada no boot). */
export type LeitorConfig = ConfigService<AppConfig, true>['get'];
