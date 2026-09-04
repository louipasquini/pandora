import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthContext } from '../../../auth/guards/jwt-auth.guard';
import { EntidadeId } from '../../../core/core.module';
import { validarMovimento } from '../../domain/pipeline';
import { PipelineRepository } from '../../infra/pipeline';
import { MovimentacaoRepository, type MovimentacaoRow } from '../../infra/pipeline/movimentacao.repository';
import { OportunidadeConsultaService } from './oportunidade-consulta.service';
import { projetarOportunidade } from './projetar-oportunidade';
import type { MoverOportunidadeDto } from '../../dto/oportunidade.schema';

function sub(req: Request): string | undefined {
  return (req as Request & { auth?: AuthContext }).auth?.sub;
}

/**
 * `POST /crm/oportunidades/:id/mover` (spec 010, US2, FR-010). Etapa destino
 * precisa pertencer ao mesmo pipeline; motivo obrigatório só ao entrar numa
 * etapa `PERDIDA`; mesma etapa é no-op idempotente (sem nova movimentação).
 * `movidoPorId` é `null` quando o sujeito é a credencial de serviço (mesmo
 * tratamento de `autor_id`/`criado_por` já usado na 009).
 */
@Injectable()
export class MoverOportunidadeService {
  constructor(
    private readonly consulta: OportunidadeConsultaService,
    private readonly pipelines: PipelineRepository,
    private readonly movimentacoes: MovimentacaoRepository,
  ) {}

  async mover(id: string, dto: MoverOportunidadeDto, req: Request) {
    const oportunidade = await this.consulta.exigirNoEscopo(id, req);
    const destino = await this.pipelines.etapaPorId(dto.etapaId);
    if (!destino) throw new NotFoundException('etapa destino não encontrada');

    const resultado = validarMovimento({
      etapaAtual: {
        id: oportunidade.etapaId,
        pipelineId: oportunidade.pipelineId,
        tipo: oportunidade.etapa.tipo,
      },
      etapaDestino: { id: destino.id, pipelineId: destino.pipelineId, tipo: destino.tipo },
      motivo: dto.motivo ?? null,
    });
    if (!resultado.ok) {
      if (resultado.erro === 'pipeline_diferente') {
        throw new UnprocessableEntityException({ erro: 'etapa_de_outro_pipeline' });
      }
      throw new UnprocessableEntityException({ erro: 'motivo_obrigatorio' });
    }
    if (resultado.noop) return projetarOportunidade(oportunidade);

    const atualizado = await this.movimentacoes.mover({
      oportunidadeId: id,
      etapaAnteriorId: oportunidade.etapaId,
      etapaNovaId: destino.id,
      movidoPorId: await this.resolverMovidoPor(sub(req)),
      motivo: dto.motivo ?? null,
    });
    return projetarOportunidade(atualizado);
  }

  async listarMovimentacoes(id: string, req: Request): Promise<MovimentacaoRow[]> {
    await this.consulta.exigirNoEscopo(id, req);
    return this.movimentacoes.listarPorOportunidade(id);
  }

  /**
   * `sub` do JWT é o id de um `Usuario` **ou** a credencial de serviço (não é
   * linha de `usuario`, nem necessariamente um UUID) — `movido_por_id` é FK
   * `@db.Uuid`, então só um `Usuario` real pode ser gravado ali (mesmo
   * tratamento de `autor_id`/`criado_por` na 009).
   */
  private async resolverMovidoPor(sujeito: string | undefined): Promise<string | null> {
    if (!sujeito || !EntidadeId.isValido(sujeito)) return null;
    return (await this.pipelines.usuarioExiste(sujeito)) ? sujeito : null;
  }
}
