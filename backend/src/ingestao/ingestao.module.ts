import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../core/config';
import { PERMISSOES } from '../auth/rbac/catalogo';
import { WebhookAuthenticator } from '../auth/webhook/webhook-authenticator';
import { EventosController } from './eventos.controller';
import { EventoRepository } from './infra/evento.repository';
import { IngestaoAuditService } from './application/ingestao-audit.service';
import { RegistrarEventoService } from './application/registrar-evento.service';
import { WorkerService } from './application/worker.service';
import { WorkerScheduler } from './application/worker.scheduler';
import { ReprocessarEventoService } from './application/reprocessar-evento.service';
import { EventosQuery } from './application/eventos.query';
import { TmbApiClientHttp, TMB_API_CLIENT } from './adapters/tmb';
import { TmbWebhooksController } from './tmb/tmb-webhooks.controller';
import { TmbIngestaoController } from './tmb/tmb-ingestao.controller';
import { TmbSyncService } from './tmb/tmb-sync.service';
import { TmbCsvImportService } from './tmb/tmb-csv-import.service';

/**
 * `ingestao` (spec 006) — 2º _bounded context_ de domínio a ganhar entidade de
 * negócio. Dono de `evento_origem` / `evento_etapa`. Importa só `core` (global) e
 * tipos de `auth` (infra transversal — decorator/`Permissao`, `WebhookAuthenticator`
 * stateless); **não** importa `financeiro`/`clientes`/`catalogo`/`contratos`
 * (ESLint `import/no-restricted-paths`). `CONTEXT_MODULES` segue com 11.
 *
 * **Exporta `RegistrarEventoService`** — a porta (etapa 0) que os adapters das
 * specs 019–022 injetam. A spec 019 adiciona o **adapter da conta `TMB`**
 * (`adapters/tmb/` — parsers puros + `TmbApiClient`) e a superfície de _delivery_
 * `tmb/` (webhooks públicos `/webhooks/tmb/*` + `/ingestao/tmb/{sincronizar,
 * importar-csv}` sob `evento:ingerir`).
 */
@Module({
  controllers: [EventosController, TmbWebhooksController, TmbIngestaoController],
  providers: [
    EventoRepository,
    IngestaoAuditService,
    RegistrarEventoService,
    WorkerService,
    WorkerScheduler,
    ReprocessarEventoService,
    EventosQuery,
    // `WebhookAuthenticator` é stateless (só lê config); instância própria do
    // contexto evita importar `AuthModule` (que registra `APP_GUARD`).
    WebhookAuthenticator,
    TmbSyncService,
    TmbCsvImportService,
    { provide: TMB_API_CLIENT, useClass: TmbApiClientHttp },
  ],
  exports: [RegistrarEventoService, WorkerService],
})
export class IngestaoModule implements OnModuleInit {
  private readonly logger = new Logger('IngestaoModule');

  constructor(private readonly cfg: ConfigService<AppConfig, true>) {}

  onModuleInit(): void {
    const evento = PERMISSOES.filter((p) => p.recurso === 'evento').map((p) => p.id);
    const worker = this.cfg.get('INGESTAO_WORKER_ENABLED', { infer: true })
      ? `laço a cada ${this.cfg.get('INGESTAO_WORKER_INTERVALO_MS', { infer: true })}ms`
      : 'sob demanda (laço desligado)';
    this.logger.log(
      `ingestao.ready worker=${worker} permissoes=${evento.length} (${evento.join(', ')}) ` +
        `adapters=[tmb: /webhooks/tmb/{vendas,financeiro}, /ingestao/tmb/{sincronizar,importar-csv}]`,
    );
  }
}
