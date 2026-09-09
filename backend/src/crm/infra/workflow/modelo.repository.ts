import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export type FluxoModeloRow = Prisma.FluxoModeloGetPayload<Record<string, never>>;

/** Biblioteca de automações prontas (CL-02) — leitura só; escrita é `prisma/seed.ts`. */
@Injectable()
export class ModeloRepository {
  constructor(private readonly prisma: PrismaService) {}

  listar(): Promise<FluxoModeloRow[]> {
    return this.prisma.fluxoModelo.findMany({ orderBy: [{ nome: 'asc' }] });
  }

  porId(id: string): Promise<FluxoModeloRow | null> {
    return this.prisma.fluxoModelo.findUnique({ where: { id } });
  }
}
