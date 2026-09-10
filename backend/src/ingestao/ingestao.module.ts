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
import { AsaasApiClientHttp, ASAAS_API_CLIENT } from './adapters/asaas';
import { AsaasWebhooksController } from './asaas/asaas-webhooks.controller';
import { AsaasIngestaoController } from './asaas/asaas-ingestao.controller';
import { AsaasSyncService } from './asaas/asaas-sync.service';
import { AsaasCsvImportService } from './asaas/asaas-csv-import.service';
import { GuruApiClientHttp, GURU_API_CLIENT } from './adapters/guru';
import { GuruWebhooksController } from './guru/guru-webhooks.controller';
import { GuruIngestaoController } from './guru/guru-ingestao.controller';
import { GuruSyncService } from './guru/guru-sync.service';
import { GuruCsvImportService } from './guru/guru-csv-import.service';

/**
 * `ingestao` (spec 006) — 2º _bounded context_ de domínio a ganhar entidade de
 * negócio. Dono de `evento_origem` / `evento_etapa`. Importa só `core` (global) e
 * tipos de `auth` (infra transversal — decorator/`Permissao`, `WebhookAuthenticator`
 * stateless); **não** importa `financeiro`/`clientes`/`catalogo`/`contratos`
 * (ESLint `import/no-restricted-paths`). `CONTEXT_MODULES` segue com 11.
 *
 * **Exporta `RegistrarEventoService`** — a porta (etapa 0) que os adapters das
 * specs 019–022 injetam. A spec 019 adicionou o **adapter da conta `TMB`**; a
 * spec 020 adiciona o **adapter das contas `ASAAS_PRD`/`ASAAS_SVC`**
 * (`adapters/asaas/` — parsers puros + `AsaasApiClient`) e a superfície de
 * _delivery_ `asaas/` (webhooks públicos por conta `/webhooks/asaas/{prd,svc}` +
 * `/ingestao/asaas/{sincronizar,importar-csv}` sob `evento:ingerir`); a spec 021
 * adiciona o **adapter das contas `GURU_PRD`/`GURU_SVC`** (`adapters/guru/` —
 * parsers puros + `GuruApiClient` com paginação por cursor) e a superfície
 * `guru/` (webhooks públicos por conta `/webhooks/guru/{prd,svc}`, token
 * `api_token` **no corpo** + `/ingestao/guru/{sincronizar,importar-csv}` sob
 * `evento:ingerir`).
 */
@Module({
  controllers: [
    EventosController,
    TmbWebhooksController,
    TmbIngestaoController,
    AsaasWebhooksController,
    AsaasIngestaoController,
    GuruWebhooksController,
    GuruIngestaoController,
  ],
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
    AsaasSyncService,
    AsaasCsvImportService,
    { provide: ASAAS_API_CLIENT, useClass: AsaasApiClientHttp },
    GuruSyncService,
    GuruCsvImportService,
    { provide: GURU_API_CLIENT, useClass: GuruApiClientHttp },
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
        `adapters=[tmb: /webhooks/tmb/{vendas,financeiro}, /ingestao/tmb/{sincronizar,importar-csv}; ` +
        `asaas: /webhooks/asaas/{prd,svc}, /ingestao/asaas/{sincronizar,importar-csv}; ` +
        `guru: /webhooks/guru/{prd,svc}, /ingestao/guru/{sincronizar,importar-csv}]`,
    );
  }
}
