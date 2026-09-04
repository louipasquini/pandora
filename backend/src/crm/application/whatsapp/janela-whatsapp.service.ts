import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { agoraUtc } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';
import { estaDentroDaJanela24h } from '../../domain/whatsapp';
import { validarAncora } from '../../domain/interacao/ancora';

export interface JanelaWhatsappView {
  dentroDaJanela: boolean;
  ultimaMensagemRecebidaEm: Date | null;
}

@Injectable()
export class JanelaWhatsappService {
  constructor(private readonly prisma: PrismaService) {}

  async obter(entrada: { pessoaId?: string; leadId?: string }): Promise<JanelaWhatsappView> {
    const ancora = validarAncora(entrada);
    if (!ancora.ok) throw new UnprocessableEntityException({ erro: `ancora_${ancora.erro}` });

    const ultima = await this.prisma.interacao.findFirst({
      where: {
        tipo: 'WHATSAPP',
        direcao: 'ENTRADA',
        ...(ancora.tipo === 'pessoa' ? { pessoaId: ancora.id } : { leadId: ancora.id }),
      },
      orderBy: [{ ocorridoEm: 'desc' }],
      select: { ocorridoEm: true },
    });

    const ultimaMensagemRecebidaEm = ultima?.ocorridoEm ?? null;
    return {
      dentroDaJanela: estaDentroDaJanela24h(ultimaMensagemRecebidaEm, agoraUtc()),
      ultimaMensagemRecebidaEm,
    };
  }
}
