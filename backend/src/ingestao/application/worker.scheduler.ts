import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../core/config';
import { WorkerService } from './worker.service';

/**
 * Laço de fundo do worker (spec 006, CL-01) — `setInterval` **in-house** (0
 * dependência; `@nestjs/schedule` foi avaliado e rejeitado). Ligado por
 * `INGESTAO_WORKER_ENABLED` (desligado em teste — `setup-db.ts` força `false`);
 * intervalo por `INGESTAO_WORKER_INTERVALO_MS`. Uma _flag_ evita passadas
 * sobrepostas; erro numa passada é logado, nunca derruba o processo.
 *
 * O gatilho **determinístico** (e2e / "rodar agora") é `POST
 * /ingestao/eventos/processar`, que chama `WorkerService.processarPassada()`
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
    if (!this.cfg.get('INGESTAO_WORKER_ENABLED', { infer: true })) {
      this.logger.log('ingestao.worker.scheduler desligado (INGESTAO_WORKER_ENABLED=false)');
      return;
    }
    const intervalo = this.cfg.get('INGESTAO_WORKER_INTERVALO_MS', { infer: true });
    this.timer = setInterval(() => void this.tick(), intervalo);
    this.timer.unref?.();
    this.logger.log(`ingestao.worker.scheduler ligado intervalo=${intervalo}ms`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.rodando) return;
    this.rodando = true;
    try {
      const r = await this.worker.processarPassada();
      if (r.selecionados > 0) {
        this.logger.log(
          `ingestao.worker.passada selecionados=${r.selecionados} ok=${r.ok} revisar=${r.revisar} erro=${r.erro} ${r.duracaoMs}ms`,
        );
      }
    } catch (err) {
      this.logger.error(`ingestao.worker.passada falhou: ${(err as Error).message}`);
    } finally {
      this.rodando = false;
    }
  }
}
