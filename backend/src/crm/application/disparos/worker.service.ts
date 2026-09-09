import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../core/config';
import { agoraUtc } from '../../../core/core.module';
import { ExecucaoDisparoRepository, MensagemDisparoRepository } from '../../infra/disparos';
import { EnviarMensagemDisparoService } from './enviar-mensagem-disparo.service';
import { MaterializarDestinatariosService } from './materializar-destinatarios.service';

export interface ResumoPassadaDisparos {
  agendadosMaterializados: number;
  mensagensEnviadas: number;
  mensagensFalharam: number;
  execucoesConcluidas: number;
}

/**
 * Worker de Disparos (spec 015) — cópia estrutural do padrão da `ingestao`
 * (006) e do `workflow` (014): passadas curtas, lote pequeno, idempotente.
 * `CRM_DISPAROS_WORKER_LOTE` por passada É o throttling (research.md D-R4) —
 * não há fila/broker externo (volume até poucos milhares por disparo).
 */
@Injectable()
export class WorkerService {
  private readonly logger = new Logger(WorkerService.name);

  constructor(
    private readonly execucoes: ExecucaoDisparoRepository,
    private readonly mensagens: MensagemDisparoRepository,
    private readonly materializar: MaterializarDestinatariosService,
    private readonly enviar: EnviarMensagemDisparoService,
    private readonly cfg: ConfigService<AppConfig, true>,
  ) {}

  async processarPassada(): Promise<ResumoPassadaDisparos> {
    const lote = this.cfg.get('CRM_DISPAROS_WORKER_LOTE', { infer: true });
    const resumo: ResumoPassadaDisparos = {
      agendadosMaterializados: 0,
      mensagensEnviadas: 0,
      mensagensFalharam: 0,
      execucoesConcluidas: 0,
    };

    const prontos = await this.execucoes.agendadosProntos(agoraUtc(), 10);
    for (const execucao of prontos) {
      await this.materializar.materializar(execucao);
      resumo.agendadosMaterializados += 1;
    }

    const pendentes = await this.mensagens.pendentesParaEnvio(lote);
    const execucoesTocadas = new Set<string>();
    for (const mensagem of pendentes) {
      const reservada = await this.mensagens.marcarEnviando(mensagem.id);
      if (!reservada) continue;
      const execucao = await this.execucoes.porId(mensagem.execucaoDisparoId);
      if (!execucao) continue;
      execucoesTocadas.add(execucao.id);
      const antes = await this.mensagens.porId(mensagem.id);
      await this.enviar.enviar(antes ?? mensagem, execucao);
      const depois = await this.mensagens.porId(mensagem.id);
      if (depois?.status === 'ENVIADA') resumo.mensagensEnviadas += 1;
      else if (depois?.status === 'FALHOU') resumo.mensagensFalharam += 1;
    }

    for (const execucaoId of execucoesTocadas) {
      const restaAlgo = await this.mensagens.existemPendentes(execucaoId);
      if (!restaAlgo) {
        await this.execucoes.atualizar(execucaoId, { status: 'CONCLUIDO', concluidoEm: agoraUtc() });
        resumo.execucoesConcluidas += 1;
      }
    }

    if (resumo.mensagensEnviadas > 0 || resumo.mensagensFalharam > 0 || resumo.agendadosMaterializados > 0) {
      this.logger.log(
        `disparos.worker.passada materializados=${resumo.agendadosMaterializados} enviadas=${resumo.mensagensEnviadas} falharam=${resumo.mensagensFalharam} concluidas=${resumo.execucoesConcluidas}`,
      );
    }
    return resumo;
  }
}
