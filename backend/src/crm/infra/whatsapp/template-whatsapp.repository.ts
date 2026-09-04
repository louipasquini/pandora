import { Injectable } from '@nestjs/common';
import { Prisma, type TemplateWhatsappStatus } from '@prisma/client';
import { EntidadeId } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';

export type TemplateWhatsappRow = Prisma.TemplateWhatsappGetPayload<Record<string, never>>;

export interface UpsertTemplateWhatsapp {
  canalId: string;
  nomeMeta: string;
  idioma: string;
  categoria: Prisma.TemplateWhatsappUncheckedCreateInput['categoria'];
  corpo: string;
  statusAprovacao: TemplateWhatsappStatus;
  motivoRejeicao: string | null;
  sincronizadoEm: Date;
}

@Injectable()
export class TemplateWhatsappRepository {
  constructor(private readonly prisma: PrismaService) {}

  obter(id: string): Promise<TemplateWhatsappRow | null> {
    return this.prisma.templateWhatsapp.findUnique({ where: { id } });
  }

  async upsert(dados: UpsertTemplateWhatsapp): Promise<TemplateWhatsappRow> {
    return this.prisma.templateWhatsapp.upsert({
      where: {
        canalId_nomeMeta_idioma: {
          canalId: dados.canalId,
          nomeMeta: dados.nomeMeta,
          idioma: dados.idioma,
        },
      },
      create: { id: EntidadeId.novo().value, ...dados },
      update: {
        categoria: dados.categoria,
        corpo: dados.corpo,
        statusAprovacao: dados.statusAprovacao,
        motivoRejeicao: dados.motivoRejeicao,
        sincronizadoEm: dados.sincronizadoEm,
      },
    });
  }

  listarPorCanal(
    canalId: string,
    statusAprovacao?: TemplateWhatsappStatus,
  ): Promise<TemplateWhatsappRow[]> {
    return this.prisma.templateWhatsapp.findMany({
      where: { canalId, ...(statusAprovacao ? { statusAprovacao } : {}) },
      orderBy: [{ nomeMeta: 'asc' }, { idioma: 'asc' }],
    });
  }
}
