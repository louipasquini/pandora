/**
 * Re-export do contrato `EventoCanonico` — o arquivo real vive em
 * `src/core/pipeline/evento-canonico.ts` desde a spec 018 (é contrato
 * compartilhado `ingestao` ↔ `financeiro`, pertence ao `core`). Este shim
 * mantém os imports internos do `ingestao` (`worker.service.ts`,
 * `registrar-evento.service.ts`, `classificar.ts`, `domain/index.ts`) sem mudança.
 */
export * from '../../core/pipeline/evento-canonico';
