import { Module } from '@nestjs/common';

/**
 * `ingestao` — adapters por (plataforma × fonte), `evento_origem` imutável e o
 * worker do pipeline canônico. Vazio na spec 001; começa a ser preenchido na
 * spec 006 (evento-origem-worker) e nas specs de adapter (Fase 2).
 *
 * Subpastas: `domain/` (modelo canônico), `application/` (pipeline/worker),
 * `infra/` (adapters, persistência).
 */
@Module({})
export class IngestaoModule {}
