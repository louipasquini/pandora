import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { AppConfig } from '../core/config';
import { JWT_ISSUER } from './auth.constants';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { NotFoundAuthFilter } from './filters/not-found-auth.filter';
import { WebhookAuthenticator } from './webhook/webhook-authenticator';

/**
 * `auth` — infra transversal (spec 003). Não é um bounded context: o guard vale
 * para todos os módulos e `auth` não é dono de entidade de domínio. Por isso
 * fica ao lado de `ConfigModule`/`PrismaModule`/`HealthModule` no `AppModule` e
 * **não** entra em `app.context-modules.ts` (`CONTEXT_MODULES` segue com 11).
 *
 * Entrega:
 *   - `POST /auth/token` (emissão _stateless_ de JWT HS256)
 *   - `JwtAuthGuard` global (`APP_GUARD`) — API fechada por padrão
 *   - `WebhookAuthenticator` — verificação de token de webhook por conta,
 *     exportada para as specs 019–022
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        secret: config.get('SERVICE_JWT_SECRET', { infer: true }),
        signOptions: {
          issuer: JWT_ISSUER,
          expiresIn: config.get('SERVICE_JWT_TTL', { infer: true }),
        },
        verifyOptions: { issuer: JWT_ISSUER, algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    RateLimitGuard,
    WebhookAuthenticator,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: NotFoundAuthFilter },
  ],
  exports: [WebhookAuthenticator],
})
export class AuthModule {}
