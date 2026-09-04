import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EntidadeId } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';

export type PipelineRow = Prisma.PipelineGetPayload<Record<string, never>>;
export type EtapaRow = Prisma.EtapaPipelineGetPayload<Record<string, never>>;

@Injectable()
export class PipelineRepository {
  constructor(private readonly prisma: PrismaService) {}

  listar(ativo?: boolean): Promise<PipelineRow[]> {
    return this.prisma.pipeline.findMany({
      where: ativo === undefined ? {} : { ativo },
      orderBy: [{ criadoEm: 'asc' }],
    });
  }

  porId(id: string): Promise<PipelineRow | null> {
    return this.prisma.pipeline.findUnique({ where: { id } });
  }

  async criar(data: {
    nome: string;
    descricao: string | null;
    equipeId: string | null;
    modoAtribuicao: Prisma.PipelineCreateInput['modoAtribuicao'];
    atribuicaoFallback: Prisma.PipelineCreateInput['atribuicaoFallback'];
    diasEsfriando: number | null;
  }): Promise<PipelineRow> {
    return this.prisma.pipeline.create({ data: { id: EntidadeId.novo().value, ...data } });
  }

  atualizar(
    id: string,
    data: Prisma.PipelineUncheckedUpdateInput,
  ): Promise<PipelineRow> {
    return this.prisma.pipeline.update({ where: { id }, data });
  }

  async equipeExiste(id: string): Promise<boolean> {
    return (await this.prisma.equipe.count({ where: { id } })) > 0;
  }

  async usuarioExiste(id: string): Promise<boolean> {
    return (await this.prisma.usuario.count({ where: { id } })) > 0;
  }

  async atualizarCursorRodizio(pipelineId: string, usuarioId: string): Promise<void> {
    await this.prisma.pipeline.update({
      where: { id: pipelineId },
      data: { ultimoAtribuidoUsuarioId: usuarioId },
    });
  }

  // --- etapas ---------------------------------------------------------------

  etapasDoPipeline(pipelineId: string): Promise<EtapaRow[]> {
    return this.prisma.etapaPipeline.findMany({
      where: { pipelineId },
      orderBy: [{ ordem: 'asc' }],
    });
  }

  etapaPorId(id: string): Promise<EtapaRow | null> {
    return this.prisma.etapaPipeline.findUnique({ where: { id } });
  }

  async temEtapaAberta(pipelineId: string): Promise<boolean> {
    return (
      (await this.prisma.etapaPipeline.count({
        where: { pipelineId, tipo: 'ABERTA' },
      })) > 0
    );
  }

  async primeiraEtapa(
    pipelineId: string,
    tipo: 'ABERTA' | 'GANHA',
  ): Promise<EtapaRow | null> {
    return this.prisma.etapaPipeline.findFirst({
      where: { pipelineId, tipo },
      orderBy: [{ ordem: 'asc' }],
    });
  }

  async criarEtapa(data: {
    pipelineId: string;
    nome: string;
    ordem: number;
    tipo: Prisma.EtapaPipelineCreateInput['tipo'];
    slaHoras: number | null;
  }): Promise<EtapaRow> {
    return this.prisma.etapaPipeline.create({
      data: { id: EntidadeId.novo().value, ...data },
    });
  }

  atualizarEtapa(
    id: string,
    data: Prisma.EtapaPipelineUncheckedUpdateInput,
  ): Promise<EtapaRow> {
    return this.prisma.etapaPipeline.update({ where: { id }, data });
  }

  async etapaEmUso(id: string): Promise<boolean> {
    const [comoAtual, comoAnterior, comoNova] = await this.prisma.$transaction([
      this.prisma.oportunidade.count({ where: { etapaId: id } }),
      this.prisma.oportunidadeMovimentacao.count({ where: { etapaAnteriorId: id } }),
      this.prisma.oportunidadeMovimentacao.count({ where: { etapaNovaId: id } }),
    ]);
    return comoAtual + comoAnterior + comoNova > 0;
  }

  async removerEtapa(id: string): Promise<void> {
    await this.prisma.etapaPipeline.delete({ where: { id } });
  }
}
