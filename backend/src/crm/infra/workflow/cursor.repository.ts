import { Injectable } from '@nestjs/common';
import { FluxoGatilhoTipo } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export interface PosicaoCursor {
  ultimoCriadoEm: Date;
  ultimoId: string;
}

/** Estado técnico do worker (D-R8) — 1 linha por fonte realmente varrida. */
@Injectable()
export class CursorRepository {
  constructor(private readonly prisma: PrismaService) {}

  async obter(fonte: FluxoGatilhoTipo): Promise<PosicaoCursor | null> {
    const row = await this.prisma.fluxoCursorFonte.findUnique({ where: { fonte } });
    return row ? { ultimoCriadoEm: row.ultimoCriadoEm, ultimoId: row.ultimoId } : null;
  }

  async avancar(fonte: FluxoGatilhoTipo, posicao: PosicaoCursor): Promise<void> {
    await this.prisma.fluxoCursorFonte.upsert({
      where: { fonte },
      create: { fonte, ultimoCriadoEm: posicao.ultimoCriadoEm, ultimoId: posicao.ultimoId },
      update: { ultimoCriadoEm: posicao.ultimoCriadoEm, ultimoId: posicao.ultimoId },
    });
  }
}
