import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

/** Verificação de saúde da aplicação (composição + banco). */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
