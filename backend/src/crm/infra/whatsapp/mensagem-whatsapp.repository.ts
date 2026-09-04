import { Injectable } from '@nestjs/common';
import { Prisma, type MensagemWhatsappStatusEntrega } from '@prisma/client';
import { EntidadeId } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';

export type MensagemWhatsappRow = Prisma.MensagemWhatsappGetPayload<Record<string, never>>;

@Injectable()
export class MensagemWhatsappRepository {
  constructor(private readonly prisma: PrismaService) {}

  async criar(
    data: Omit<Prisma.MensagemWhatsappUncheckedCreateInput, 'id'>,
  ): Promise<MensagemWhatsappRow> {
    return this.prisma.mensagemWhatsapp.create({
      data: { id: EntidadeId.novo().value, ...data },
    });
  }

  porInteracaoId(interacaoId: string): Promise<MensagemWhatsappRow | null> {
    return this.prisma.mensagemWhatsapp.findUnique({ where: { interacaoId } });
  }

  porWaMessageId(waMessageId: string): Promise<MensagemWhatsappRow | null> {
    return this.prisma.mensagemWhatsapp.findFirst({ where: { waMessageId } });
  }

  async atualizarStatusEntrega(
    id: string,
    statusEntrega: MensagemWhatsappStatusEntrega,
    erroDetalhe: string | null,
  ): Promise<void> {
    await this.prisma.mensagemWhatsapp.update({
      where: { id },
      data: { statusEntrega, erroDetalhe },
    });
  }
}
