import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { avaliarRegras, escolherProximoRodizio, type ContextoAtribuicao } from '../../domain/pipeline';
import { EquipeRepository } from '../../infra/equipe.repository';
import { PipelineRepository, type PipelineRow } from '../../infra/pipeline';
import { RegraAtribuicaoRepository, type RegraRow } from '../../infra/pipeline/regra-atribuicao.repository';
import { precisaEquipe } from './pipeline.service';
import type { AtribuicaoPipelineDto } from '../../dto/pipeline.schema';

function projetarRegra(r: RegraRow) {
  return {
    ordem: r.ordem,
    campo: r.campo,
    valor: r.valor,
    responsavelId: r.responsavelId,
  };
}

/**
 * Atribuição automática de `oportunidade` (spec 010, D-03/FR-013..FR-016).
 * `resolverResponsavel` é a porta que `OportunidadeService.criar` chama —
 * `responsavelId` explícito sempre vence (FR-016); persiste o cursor de
 * rodízio na mesma chamada (research.md).
 */
@Injectable()
export class AtribuicaoService {
  constructor(
    private readonly pipelines: PipelineRepository,
    private readonly regras: RegraAtribuicaoRepository,
    private readonly equipes: EquipeRepository,
  ) {}

  async obter(pipelineId: string) {
    const p = await this.pipelines.porId(pipelineId);
    if (!p) throw new NotFoundException('pipeline não encontrado');
    const lista = await this.regras.listar(pipelineId);
    return {
      modoAtribuicao: p.modoAtribuicao,
      atribuicaoFallback: p.atribuicaoFallback,
      regras: lista.map(projetarRegra),
    };
  }

  async substituir(pipelineId: string, dto: AtribuicaoPipelineDto) {
    const p = await this.pipelines.porId(pipelineId);
    if (!p) throw new NotFoundException('pipeline não encontrado');

    if (precisaEquipe(dto.modoAtribuicao, dto.atribuicaoFallback) && !p.equipeId) {
      throw new UnprocessableEntityException({ erro: 'equipe_obrigatoria_para_rodizio' });
    }
    for (const r of dto.regras) {
      if (!(await this.regras.usuarioExiste(r.responsavelId))) {
        throw new UnprocessableEntityException({
          erro: 'responsavel_nao_encontrado',
          responsavelId: r.responsavelId,
        });
      }
    }

    await this.pipelines.atualizar(pipelineId, {
      modoAtribuicao: dto.modoAtribuicao,
      atribuicaoFallback: dto.atribuicaoFallback,
    });
    await this.regras.substituir(
      pipelineId,
      dto.regras.map((r) => ({
        ordem: r.ordem,
        campo: r.campo,
        valor: r.valor,
        responsavelId: r.responsavelId,
      })),
    );
    return this.obter(pipelineId);
  }

  /**
   * Resolve o `responsavelId` na criação de uma oportunidade (FR-007/FR-013..016).
   * `responsavelIdExplicito` sempre vence — nenhuma regra roda nesse caso.
   */
  async resolverResponsavel(
    pipeline: PipelineRow,
    contexto: ContextoAtribuicao,
    responsavelIdExplicito?: string | null,
  ): Promise<string | null> {
    if (responsavelIdExplicito) return responsavelIdExplicito;
    if (pipeline.modoAtribuicao === 'MANUAL') return null;

    if (pipeline.modoAtribuicao === 'REGRA') {
      const regras = await this.regras.listar(pipeline.id);
      const viaRegra = avaliarRegras(
        regras.map((r) => ({
          ordem: r.ordem,
          campo: r.campo,
          valor: r.valor as { igual?: string; minimoInt?: string; moeda?: string },
          responsavelId: r.responsavelId,
        })),
        contexto,
      );
      if (viaRegra) return viaRegra;
      if (pipeline.atribuicaoFallback !== 'RODIZIO') return null;
      return this.proximoRodizio(pipeline);
    }

    // RODIZIO
    return this.proximoRodizio(pipeline);
  }

  private async proximoRodizio(pipeline: PipelineRow): Promise<string | null> {
    if (!pipeline.equipeId) return null;
    const membros = await this.equipes.membrosAtivos(pipeline.equipeId);
    const proximo = escolherProximoRodizio(
      membros.map((m) => ({ usuarioId: m.usuarioId, entrouEm: m.entrouEm })),
      pipeline.ultimoAtribuidoUsuarioId,
    );
    if (proximo) await this.pipelines.atualizarCursorRodizio(pipeline.id, proximo);
    return proximo;
  }
}
