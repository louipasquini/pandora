import { Injectable, Logger } from '@nestjs/common';
import type { FluxoGatilhoTipo } from '@prisma/client';
import { agoraUtc } from '../../../core/core.module';
import { avaliarCondicao, registroTipoDoGatilho, type AcaoAplicadaResultado } from '../../domain/workflow';
import { ExecucaoRepository } from '../../infra/workflow/execucao.repository';
import { FluxoRepository, type FluxoVersaoRow } from '../../infra/workflow/fluxo.repository';
import { CursorRepository } from '../../infra/workflow/cursor.repository';
import { FONTES_REAIS, FontesRepository, type LinhaFonte } from '../../infra/workflow/fontes.repository';
import { ContextoRegistroService } from './contexto-registro.service';
import { ExecutarAcaoService } from './executar-acao.service';
import type { AcaoFluxo, CondicaoNo } from '../../domain/workflow';

export interface ResumoPassada {
  fontesVarridas: FluxoGatilhoTipo[];
  execucoesCriadas: number;
  execucoesFalharam: number;
}

/**
 * Menor UUID possível — sentinela usada só para estabelecer a "linha de
 * partida" do cursor (research.md D-R9), nunca um id real.
 */
const CURSOR_ID_SENTINELA = '00000000-0000-0000-0000-000000000000';

/**
 * Worker do Workflow (spec 014) — cópia estrutural do padrão da `ingestao`
 * (spec 006), adaptado a um domínio mais simples: para cada fonte real
 * (`FONTES_REAIS`), lê o lote desde o cursor, casa cada linha contra os
 * fluxos publicados daquele gatilho, avalia condição e roda ações — tudo
 * idempotente por `(fluxo_versao_id, fonte, fonte_registro_id)` (D-06).
 */
@Injectable()
export class WorkerService {
  private readonly logger = new Logger(WorkerService.name);

  constructor(
    private readonly cursores: CursorRepository,
    private readonly fontes: FontesRepository,
    private readonly fluxos: FluxoRepository,
    private readonly execucoes: ExecucaoRepository,
    private readonly contexto: ContextoRegistroService,
    private readonly acoes: ExecutarAcaoService,
  ) {}

  async processarPassada(): Promise<ResumoPassada> {
    const resumo: ResumoPassada = { fontesVarridas: [], execucoesCriadas: 0, execucoesFalharam: 0 };

    for (const fonte of FONTES_REAIS) {
      const cursorAtual = await this.cursores.obter(fonte);
      if (!cursorAtual) {
        // 1ª vez que esta fonte é varrida: estabelece a linha de partida em
        // "agora" (D-R9) — nunca varre o histórico anterior à ativação do
        // Workflow. Publicar um fluxo não reage retroativamente a leads/
        // interações/etc. já existentes, só a eventos daqui pra frente.
        await this.cursores.avancar(fonte, {
          ultimoCriadoEm: agoraUtc(),
          ultimoId: CURSOR_ID_SENTINELA,
        });
        continue;
      }
      const linhas = await this.fontes.linhasDesde(fonte, cursorAtual, 50);
      if (linhas.length === 0) continue;

      resumo.fontesVarridas.push(fonte);
      const versoes = await this.fluxos.fluxosPublicadosPorGatilho(fonte);

      for (const linha of linhas) {
        for (const versao of versoes) {
          const r = await this.processarLinha(fonte, linha, versao);
          if (r === 'criada') resumo.execucoesCriadas += 1;
          if (r === 'falhou') resumo.execucoesFalharam += 1;
        }
      }

      const ultima = linhas[linhas.length - 1];
      await this.cursores.avancar(fonte, { ultimoCriadoEm: ultima.criadoEm, ultimoId: ultima.id });
    }

    return resumo;
  }

  private async processarLinha(
    fonte: FluxoGatilhoTipo,
    linha: LinhaFonte,
    versao: FluxoVersaoRow,
  ): Promise<'criada' | 'pulada' | 'falhou'> {
    const chave = { fluxoVersaoId: versao.id, fonte, fonteRegistroId: linha.id };
    if (await this.execucoes.existe(chave)) return 'pulada'; // D-06

    const registroTipo = registroTipoDoGatilho(fonte);
    if (!registroTipo) return 'pulada'; // nunca acontece para uma fonte real

    const dadosContexto = await this.contexto.montar(registroTipo, linha.registroId);
    if (!dadosContexto) {
      await this.execucoes.registrar({
        ...chave,
        registroTipo,
        registroId: linha.registroId,
        resultado: 'FALHOU',
        acoesAplicadas: [],
        erroDetalhe: 'registro não encontrado no momento do processamento',
        ocorridoEm: linha.criadoEm,
      });
      return 'falhou';
    }

    const condicaoOk = avaliarCondicao(versao.condicoes as unknown as CondicaoNo, dadosContexto);
    if (!condicaoOk) {
      await this.execucoes.registrar({
        ...chave,
        registroTipo,
        registroId: linha.registroId,
        resultado: 'CONDICAO_NAO_SATISFEITA',
        acoesAplicadas: [],
        erroDetalhe: null,
        ocorridoEm: linha.criadoEm,
      });
      return 'criada';
    }

    const acoesAplicadas: AcaoAplicadaResultado[] = [];
    let erroDetalhe: string | null = null;
    const listaAcoes = versao.acoes as unknown as AcaoFluxo[];
    for (const acao of listaAcoes) {
      try {
        await this.acoes.executar(acao, linha.registroId, versao.id);
        acoesAplicadas.push({ tipo: acao.tipo, status: 'aplicada' });
      } catch (err) {
        const detalhe = (err as Error).message.slice(0, 500);
        acoesAplicadas.push({ tipo: acao.tipo, status: 'falhou', detalhe });
        erroDetalhe = detalhe;
        this.logger.warn(
          `workflow.acao falhou fluxo_versao=${versao.id} acao=${acao.tipo} registro=${linha.registroId}: ${detalhe}`,
        );
        break; // D-R6 — pára só esta execução, nunca a passada inteira
      }
    }

    await this.execucoes.registrar({
      ...chave,
      registroTipo,
      registroId: linha.registroId,
      resultado: erroDetalhe ? 'FALHOU' : 'EXECUTADA',
      acoesAplicadas,
      erroDetalhe,
      ocorridoEm: linha.criadoEm,
    });
    return erroDetalhe ? 'falhou' : 'criada';
  }
}
