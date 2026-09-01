import { Module } from '@nestjs/common';

/**
 * `api` — módulo de borda: routers finos por contexto (só orquestração HTTP,
 * sem regra de negócio). Compõe os demais contextos, por isso fica fora da regra
 * de fronteira do ESLint. Vazio na spec 001; ganha routers conforme cada
 * contexto expõe recursos.
 */
@Module({})
export class ApiModule {}
