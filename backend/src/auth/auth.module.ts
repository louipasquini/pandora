import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, DiscoveryModule } from '@nestjs/core';
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
import { PERMISSOES, assertCatalogoCoerente } from './rbac/catalogo';
import { PermissionGuard } from './rbac/guards/permission.guard';
import { RbacRepository } from './rbac/rbac.repository';
import { RbacAuditService } from './rbac/rbac-audit.service';
import { RbacRouteAudit } from './rbac/rbac-route-audit';
import { SujeitoRbacService } from './rbac/sujeito-rbac.service';
import { AdminRbacController } from './rbac/admin-rbac.controller';

/**
 * `auth` — infra transversal (specs 003 + 004). **Não** é um bounded context: os
 * guards valem para todos os módulos e `auth` não é dono de entidade de domínio.
 * Fica ao lado de `ConfigModule`/`PrismaModule`/`HealthModule` no `AppModule` e
 * **não** entra em `app.context-modules.ts` (`CONTEXT_MODULES` segue com 11).
 *
 * Entrega:
 *   - `POST /auth/token` (emissão _stateless_ de JWT HS256) + `GET /auth/permissoes-efetivas`
 *   - `JwtAuthGuard` (1º `APP_GUARD`) — API fechada por padrão
 *   - `PermissionGuard` (2º `APP_GUARD`) — autorização por permissão; nega por omissão (CL-03)
 *   - `WebhookAuthenticator` — token de webhook por conta (exportado p/ as specs 019–022)
 *   - RBAC: catálogo em código, perfis/atribuições em Postgres, `rbac_audit` append-only,
 *     `/admin/rbac/*` (spec 004)
 */
@Module({
  imports: [
    DiscoveryModule,
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
  controllers: [AuthController, AdminRbacController],
  providers: [
    AuthService,
    RateLimitGuard,
    WebhookAuthenticator,
    RbacRepository,
    RbacAuditService,
    SujeitoRbacService,
    RbacRouteAudit,
    // Ordem importa: JwtAuthGuard autentica (põe req.auth); PermissionGuard usa.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_FILTER, useClass: NotFoundAuthFilter },
  ],
  exports: [WebhookAuthenticator, SujeitoRbacService],
})
export class AuthModule implements OnModuleInit {
  private readonly logger = new Logger('AuthModule');

  onModuleInit(): void {
    assertCatalogoCoerente();
    this.logger.log(
      `rbac.ready permissoes=${PERMISSOES.length} perfis_sistema=1`,
    );
  }
}
