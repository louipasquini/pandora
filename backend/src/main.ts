import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import type { AppConfig } from './config/env.schema';

async function bootstrap(): Promise<void> {
  // Se envSchema.parse falhar (validate do ConfigModule), NestFactory.create
  // rejeita aqui com o caminho da variável — o processo aborta (FR-008).
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService<AppConfig, true>);
  const port = config.get('PORT', { infer: true });

  await app.listen(port);
  new Logger('Bootstrap').log(`Pandora backend ouvindo em http://localhost:${port} (/health)`);
}

void bootstrap().catch((err) => {
  new Logger('Bootstrap').error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
