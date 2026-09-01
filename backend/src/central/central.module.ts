import { Module } from '@nestjs/common';

/**
 * `central` — composição read-model (BFF) + comandos, e o portal da própria
 * aluna (LGPD, preferências de comunicação). Nunca é dona de dado
 * financeiro/comercial/identidade. Vazio na spec 001; preenchido a partir da
 * spec 044 (central-bff-360).
 */
@Module({})
export class CentralModule {}
