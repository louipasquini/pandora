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

  // Painel (:5174) chama a API (:3001) em origem cruzada. Token vai no header
  // Authorization, não em cookie — `credentials: false`.
  app.enableCors({
    origin: config.get('CORS_ORIGIN', { infer: true }),
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: false,
  });
  // `req.ip` respeita X-Forwarded-For atrás de 1 proxy (rate limiting por IP).
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  await app.listen(port);
  new Logger('Bootstrap').log(`Pandora backend ouvindo em http://localhost:${port} (/health)`);
}

void bootstrap().catch((err) => {
  new Logger('Bootstrap').error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
