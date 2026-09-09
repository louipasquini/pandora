import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { EntidadeId } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';

export type DisparoContatoImportadoRow = Prisma.DisparoContatoImportadoGetPayload<
  Record<string, never>
>;

export interface NovoContatoImportado {
  execucaoDisparoId: string;
  telefone: string;
  nome: string | null;
  leadId: string | null;
  pessoaId: string | null;
}

@Injectable()
export class ContatoImportadoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async criarLote(linhas: NovoContatoImportado[]): Promise<number> {
    if (linhas.length === 0) return 0;
    const r = await this.prisma.disparoContatoImportado.createMany({
      data: linhas.map((l) => ({ id: EntidadeId.novo().value, ...l })),
      skipDuplicates: true,
    });
    return r.count;
  }

  listarPorExecucao(execucaoDisparoId: string): Promise<DisparoContatoImportadoRow[]> {
    return this.prisma.disparoContatoImportado.findMany({
      where: { execucaoDisparoId },
      orderBy: [{ criadoEm: 'asc' }],
    });
  }
}
