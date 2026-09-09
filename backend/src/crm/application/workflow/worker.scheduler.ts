import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../core/config';
import { WorkerService } from './worker.service';

/**
 * Laço de fundo do worker do Workflow (spec 014) — cópia estrutural do
 * `WorkerScheduler` da `ingestao` (spec 006, research.md D-R5): `setInterval`
 * in-house (0 dependência nova), ligado por `CRM_WORKFLOW_WORKER_ENABLED`
 * (desligado em teste — `setup-db.ts` força `false`), mutex `rodando` evita
 * passadas sobrepostas. O gatilho determinístico (e2e / "rodar agora") é
 * `POST /crm/workflow/processar`, que chama `WorkerService.processarPassada()`
 * direto — não depende deste agendador.
 */
@Injectable()
export class WorkerScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerScheduler.name);
  private timer?: NodeJS.Timeout;
  private rodando = false;

  constructor(
    private readonly worker: WorkerService,
    private readonly cfg: ConfigService<AppConfig, true>,
  ) {}

  onModuleInit(): void {
    if (!this.cfg.get('CRM_WORKFLOW_WORKER_ENABLED', { infer: true })) {
      this.logger.log(
        'crm.workflow.worker.scheduler desligado (CRM_WORKFLOW_WORKER_ENABLED=false)',
      );
      return;
    }
    const intervalo = this.cfg.get('CRM_WORKFLOW_WORKER_INTERVALO_MS', { infer: true });
    this.timer = setInterval(() => void this.tick(), intervalo);
    this.timer.unref?.();
    this.logger.log(`crm.workflow.worker.scheduler ligado intervalo=${intervalo}ms`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.rodando) return;
    this.rodando = true;
    try {
      const r = await this.worker.processarPassada();
      if (r.execucoesCriadas > 0 || r.execucoesFalharam > 0) {
        this.logger.log(
          `crm.workflow.worker.passada fontes=${r.fontesVarridas.length} criadas=${r.execucoesCriadas} falharam=${r.execucoesFalharam}`,
        );
      }
    } catch (err) {
      this.logger.error(`crm.workflow.worker.passada falhou: ${(err as Error).message}`);
    } finally {
      this.rodando = false;
    }
  }
}
