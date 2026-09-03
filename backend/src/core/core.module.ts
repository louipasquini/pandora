import { Global, Module } from '@nestjs/common';

/**
 * `core` — primitivas canônicas transversais (Princípio I / Padrões Transversais).
 *
 * Entrega:
 *   - identidade: `uuidv7()` e o Value Object `EntidadeId` (spec 001)
 *   - `PlataformaOrigem` — as 7 contas (spec 001)
 *   - dinheiro: `Dinheiro`, `Moeda`/ISO 4217, `ratear`/`ratearPorPesos` (spec 002)
 *   - tempo: `parseInstante` (borda tolerante, livre de locale) e `agoraUtc` (spec 002)
 *   - status: `StatusTransacaoCanonico` / `StatusContratoCanonico` + funções puras
 *     `liberaAcesso` / `contaComoReceita` / `contratoLiberaAcesso` +
 *     `paraStatusTransacaoCanonico` (rede de segurança) (spec 002)
 *   - auditoria: contrato `EntidadeAuditavel` + `RegistroAuditoria` /
 *     `montarRegistroAuditoria` (spec 002)
 *   - config: contrato tipado (`AppConfig`, `accountConfig`, `LeitorConfig`) (spec 002)
 *
 * `@Global()`: os demais contextos podem depender de `core` sem reimportá-lo
 * (é a única exceção à regra de fronteira entre contextos). As primitivas são
 * puras — não há provider NestJS aqui.
 */
@Global()
@Module({})
export class CoreModule {}

// --- identidade (001) ---
export { EntidadeId } from './ids/entidade-id';
export { uuidv7 } from './ids/uuid';
export {
  PlataformaOrigem,
  PLATAFORMAS_ORIGEM,
  PLATAFORMA_ORIGEM_LABEL,
} from './plataforma-origem.enum';

// --- dinheiro (002) ---
export { Dinheiro, ESCALA, type DinheiroSerializado } from './dinheiro/dinheiro';
export {
  type Moeda,
  ISO_4217,
  ISO_4217_SET,
  ehMoeda,
  assertMoeda,
  criarMoeda,
} from './dinheiro/moeda';
export { ratear, ratearPorPesos } from './dinheiro/ratear';

// --- tempo (002) ---
export { parseInstante, type ResultadoInstante } from './tempo/parse-instante';
export { agoraUtc } from './tempo/agora';
export { duracaoParaSegundos } from './tempo/duracao';

// --- status (002) ---
export {
  StatusTransacaoCanonico,
  STATUS_TRANSACAO_CANONICO,
  liberaAcesso,
  contaComoReceita,
} from './status/status-transacao';
export {
  StatusContratoCanonico,
  STATUS_CONTRATO_CANONICO,
  contratoLiberaAcesso,
} from './status/status-contrato';
export {
  paraStatusTransacaoCanonico,
  type ResolucaoStatus,
} from './status/resolver-status';

// --- auditoria (002) ---
export {
  type EntidadeAuditavel,
  TIMESTAMPTZ_PRISMA,
} from './auditoria/entidade-auditavel';
export {
  OrigemMudanca,
  type RegistroAuditoria,
  montarRegistroAuditoria,
} from './auditoria/registro-auditoria';

// --- config (002) ---
export { type AppConfig, type LeitorConfig, accountConfig } from './config';
