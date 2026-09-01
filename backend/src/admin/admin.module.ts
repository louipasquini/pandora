import { Module } from '@nestjs/common';

/**
 * `admin` — módulo de borda: sync sob demanda, imports CSV, curadoria. Toda ação
 * é explícita e com confirmação no backend (Princípio VIII). Compõe os demais
 * contextos, por isso fica fora da regra de fronteira do ESLint. Vazio na
 * spec 001; preenchido a partir da spec 028 (sync-sob-demanda-e-imports).
 */
@Module({})
export class AdminModule {}
