import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EntidadeId } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';

export type CanalWhatsappRow = Prisma.CanalWhatsappGetPayload<Record<string, never>>;

@Injectable()
export class CanalWhatsappRepository {
  constructor(private readonly prisma: PrismaService) {}

  async criar(
    data: Omit<Prisma.CanalWhatsappUncheckedCreateInput, 'id'>,
  ): Promise<CanalWhatsappRow> {
    return this.prisma.canalWhatsapp.create({ data: { id: EntidadeId.novo().value, ...data } });
  }

  obter(id: string): Promise<CanalWhatsappRow | null> {
    return this.prisma.canalWhatsapp.findUnique({ where: { id } });
  }

  porPhoneNumberId(phoneNumberId: string): Promise<CanalWhatsappRow | null> {
    return this.prisma.canalWhatsapp.findUnique({ where: { phoneNumberId } });
  }

  listarAtivos(): Promise<CanalWhatsappRow[]> {
    return this.prisma.canalWhatsapp.findMany({ where: { ativo: true } });
  }

  async atualizar(
    id: string,
    data: Prisma.CanalWhatsappUpdateInput,
  ): Promise<CanalWhatsappRow> {
    return this.prisma.canalWhatsapp.update({ where: { id }, data });
  }

  async listar(filtro: {
    pagina: number;
    tamanho: number;
  }): Promise<{ itens: CanalWhatsappRow[]; total: number }> {
    const [itens, total] = await this.prisma.$transaction([
      this.prisma.canalWhatsapp.findMany({
        orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
        skip: (filtro.pagina - 1) * filtro.tamanho,
        take: filtro.tamanho,
      }),
      this.prisma.canalWhatsapp.count(),
    ]);
    return { itens, total };
  }

  async marcarUltimoWebhookRecebido(id: string, quando: Date): Promise<void> {
    await this.prisma.canalWhatsapp.update({
      where: { id },
      data: { ultimoWebhookRecebidoEm: quando },
    });
  }
}
