import { Injectable } from '@nestjs/common';
import { Prisma, type EventoWebhookWhatsappStatus } from '@prisma/client';
import { EntidadeId } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';

export type EventoWebhookWhatsappRow = Prisma.EventoWebhookWhatsappGetPayload<
  Record<string, never>
>;

@Injectable()
export class EventoWebhookWhatsappRepository {
  constructor(private readonly prisma: PrismaService) {}

  porHash(hash: string): Promise<EventoWebhookWhatsappRow | null> {
    return this.prisma.eventoWebhookWhatsapp.findUnique({ where: { hash } });
  }

  async criar(
    data: Omit<Prisma.EventoWebhookWhatsappUncheckedCreateInput, 'id'>,
  ): Promise<EventoWebhookWhatsappRow> {
    return this.prisma.eventoWebhookWhatsapp.create({
      data: { id: EntidadeId.novo().value, ...data },
    });
  }

  async atualizarStatus(
    id: string,
    status: EventoWebhookWhatsappStatus,
    erroDetalhe: string | null,
  ): Promise<void> {
    await this.prisma.eventoWebhookWhatsapp.update({
      where: { id },
      data: { status, erroDetalhe },
    });
  }

  obter(id: string): Promise<EventoWebhookWhatsappRow | null> {
    return this.prisma.eventoWebhookWhatsapp.findUnique({ where: { id } });
  }

  async listar(filtro: {
    status?: EventoWebhookWhatsappStatus;
    pagina: number;
    tamanho: number;
  }): Promise<{ itens: EventoWebhookWhatsappRow[]; total: number }> {
    const where: Prisma.EventoWebhookWhatsappWhereInput = filtro.status
      ? { status: filtro.status }
      : {};
    const [itens, total] = await this.prisma.$transaction([
      this.prisma.eventoWebhookWhatsapp.findMany({
        where,
        orderBy: [{ recebidoEm: 'desc' }, { id: 'desc' }],
        skip: (filtro.pagina - 1) * filtro.tamanho,
        take: filtro.tamanho,
      }),
      this.prisma.eventoWebhookWhatsapp.count({ where }),
    ]);
    return { itens, total };
  }
}
