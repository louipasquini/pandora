import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Classificacao,
  EtapaIngestao,
  EventoEtapaStatus,
  EventoOrigemStatus,
} from '@prisma/client';
import type { AppConfig } from '../../core/config';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ETAPAS_DO_WORKER,
  classificar,
  eventoCanonicoSchema,
  planejarPassada,
} from '../domain';
import type { EtapaCtx, Executor, ResumoPassada } from '../domain';
import { EventoRepository } from '../infra/evento.repository';
import { EXECUTORES_NOOP } from './etapas-noop';

const TETO_ITERACOES = 10;

/**
 * Worker do pipeline de ingestão (spec 006). `processarPassada()` seleciona
 * eventos com trabalho elegível e roda as etapas 1–6 — **cada etapa numa
 * transação própria** (commit próprio, Princípio IV), idempotente. Etapa `ok`/
 * `pulada` nunca reexecuta; etapa `erro` re-tentada até
 * `INGESTAO_WORKER_MAX_TENTATIVAS`; dependência não-`ok` → dependente `bloqueada`.
 *
 * As etapas 2–6 vêm de `EXECUTORES_NOOP`; uma spec futura pluga a real via
 * `definirExecutor(nome, exec)` — sem tocar este arquivo.
 */
@Injectable()
export class WorkerService {
  private readonly logger = new Logger(WorkerService.name);
  private readonly executores = new Map<EtapaIngestao, Executor>();
  /** Mutex por evento — impede duas passadas concorrentes de processar o mesmo. */
  private readonly emProcessamento = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: EventoRepository,
    private readonly cfg: ConfigService<AppConfig, true>,
  ) {
    this.executores.set(EtapaIngestao.CLASSIFICAR, this.executarClassificar);
    for (const [nome, exec] of EXECUTORES_NOOP) this.executores.set(nome, exec);
  }

  /** Ponto de extensão: specs 018/023/024/025 (ou testes) plugam a etapa real. */
  definirExecutor(nome: EtapaIngestao, exec: Executor): void {
    this.executores.set(nome, exec);
  }

  /** Executor atualmente registrado para `nome` (para testes salvarem/restaurarem). */
  executorAtual(nome: EtapaIngestao): Executor | undefined {
    return this.executores.get(nome);
  }

  private get max(): number {
    return this.cfg.get('INGESTAO_WORKER_MAX_TENTATIVAS', { infer: true });
  }

  async processarPassada(): Promise<ResumoPassada> {
    const inicio = Date.now();
    const lote = this.cfg.get('INGESTAO_WORKER_LOTE', { infer: true });
    const ids = await this.repo.selecionarElegiveisIds(this.max, lote);

    const resumo: ResumoPassada = {
      selecionados: 0,
      ok: 0,
      revisar: 0,
      erro: 0,
      bloqueadas: 0,
      duracaoMs: 0,
    };

    for (const id of ids) {
      if (this.emProcessamento.has(id)) continue;
      this.emProcessamento.add(id);
      resumo.selecionados += 1;
      try {
        const r = await this.processarEvento(id);
        if (r.status === EventoOrigemStatus.ok) resumo.ok += 1;
        else if (r.status === EventoOrigemStatus.revisar) resumo.revisar += 1;
        else if (r.status === EventoOrigemStatus.erro) resumo.erro += 1;
        resumo.bloqueadas += r.bloqueadas;
      } catch (err) {
        this.logger.error(
          `ingestao.worker evento=${id} falha inesperada: ${(err as Error).message}`,
        );
        resumo.erro += 1;
      } finally {
        this.emProcessamento.delete(id);
      }
    }

    resumo.duracaoMs = Date.now() - inicio;
    return resumo;
  }

  private async processarEvento(
    id: string,
  ): Promise<{ status: EventoOrigemStatus; bloqueadas: number }> {
    const evento = await this.prisma.eventoOrigem.findUnique({
      where: { id },
      select: { id: true, tipoOrigem: true, eventoCanonico: true },
    });
    if (!evento) return { status: EventoOrigemStatus.ok, bloqueadas: 0 };

    const parsedC = eventoCanonicoSchema.safeParse(evento.eventoCanonico);
    const ctx: Omit<EtapaCtx, 'tx'> = {
      eventoId: id,
      tipoOrigem: evento.tipoOrigem,
      canonico: parsedC.success ? parsedC.data : null,
    };

    for (let i = 0; i < TETO_ITERACOES; i += 1) {
      const snap = await this.repo.snapshotEtapas(this.prisma, id);
      const { acoes } = planejarPassada(snap, this.max);
      const proxima = ETAPAS_DO_WORKER.find((d) => acoes.get(d.nome) === 'EXECUTAR');
      if (!proxima) break;

      const executor: Executor =
        this.executores.get(proxima.nome) ??
        (async () => ({ status: 'pulada', resultado: { implementadaNa: null } }));

      await this.prisma.$transaction((tx) =>
        this.repo.atualizarEtapa(tx, id, proxima.nome, {
          status: EventoEtapaStatus.processando,
        }),
      );

      try {
        const res = await executor({ ...ctx, tx: this.prisma });
        await this.prisma.$transaction((tx) =>
          this.repo.atualizarEtapa(tx, id, proxima.nome, {
            status:
              res.status === 'pulada'
                ? EventoEtapaStatus.pulada
                : EventoEtapaStatus.ok,
            resultado: {
              ...(typeof res.resultado === 'object' && res.resultado
                ? (res.resultado as Record<string, unknown>)
                : { valor: res.resultado }),
              ...(res.revisar ? { revisar: true } : {}),
            },
          }),
        );
      } catch (err) {
        await this.prisma.$transaction((tx) =>
          this.repo.atualizarEtapa(tx, id, proxima.nome, {
            status: EventoEtapaStatus.erro,
            erroDetalhe: (err as Error).message.slice(0, 500),
            incrementarTentativa: true,
          }),
        );
        this.logger.warn(
          `ingestao.worker evento=${id} etapa=${proxima.nome} erro: ${(err as Error).message}`,
        );
        break; // não insiste nesta etapa nesta passada
      }
    }

    return this.derivarEGravar(id);
  }

  private async derivarEGravar(
    id: string,
  ): Promise<{ status: EventoOrigemStatus; bloqueadas: number }> {
    const snap = await this.repo.snapshotEtapas(this.prisma, id);
    const { acoes, statusEvento } = planejarPassada(snap, this.max);
    const bloqueadas = [...acoes.values()].filter((a) => a === 'BLOQUEADA').length;

    // Persiste `bloqueada` para etapas ainda `pendente` cuja dependência não
    // ficou `ok` — é o estado visível no painel; `erro` nunca é sobrescrito.
    const porNome = new Map(snap.map((s) => [s.etapa, s]));
    for (const [nome, acao] of acoes) {
      if (acao === 'BLOQUEADA' && porNome.get(nome)?.status === EventoEtapaStatus.pendente) {
        await this.prisma.$transaction((tx) =>
          this.repo.atualizarEtapa(tx, id, nome, { status: EventoEtapaStatus.bloqueada }),
        );
      }
    }

    const etapasDb = await this.prisma.eventoEtapa.findMany({
      where: { eventoOrigemId: id },
      select: { etapa: true, status: true, resultado: true, erroDetalhe: true },
    });
    const classify = etapasDb.find((e) => e.etapa === EtapaIngestao.CLASSIFICAR);
    const classificacao =
      classify?.resultado && typeof classify.resultado === 'object'
        ? ((classify.resultado as Record<string, unknown>).classificacao as
            | Classificacao
            | undefined)
        : undefined;

    let erroDetalhe: string | null = null;
    if (statusEvento === EventoOrigemStatus.erro) {
      erroDetalhe =
        etapasDb.find((e) => e.status === EventoEtapaStatus.erro)?.erroDetalhe ??
        'uma etapa do pipeline falhou';
    } else if (statusEvento === EventoOrigemStatus.revisar) {
      const motivo =
        classify?.resultado && typeof classify.resultado === 'object'
          ? ((classify.resultado as Record<string, unknown>).motivo as string | undefined)
          : undefined;
      erroDetalhe = motivo ?? 'classificação em revisão';
    }

    await this.prisma.$transaction((tx) =>
      this.repo.atualizarEventoDerivado(tx, id, {
        status: statusEvento,
        classificacao: classificacao ?? null,
        erroDetalhe,
      }),
    );

    return { status: statusEvento, bloqueadas };
  }

  private readonly executarClassificar: Executor = async (ctx) => {
    const r = classificar(ctx.canonico, ctx.tipoOrigem);
    return {
      status: 'ok',
      resultado: { classificacao: r.classificacao, motivo: r.motivo },
      revisar: r.revisar,
      classificacao: r.classificacao,
      motivo: r.motivo,
    };
  };
}
