import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { EntidadeId } from '../../core/core.module';
import { PrismaService } from '../../prisma/prisma.service';
import type { SnapshotConta } from '../domain';
import type { Tx } from './pessoa.repository';

export interface ContaDetalheView {
  id: string;
  nome: string;
  tipo: string;
  mergedPara: string | null;
  pessoas: { id: string; nome: string }[];
  merges: {
    id: string;
    papel: 'sobrevivente' | 'absorvida';
    absorvidaId: string;
    sobreviventeId: string;
    quando: Date;
    estado: string;
    autor: string;
  }[];
}

@Injectable()
export class ContaRepository {
  constructor(private readonly prisma: PrismaService) {}

  novoId(): string {
    return EntidadeId.novo().value;
  }

  async raizAtiva(id: string, tx: Tx = this.prisma): Promise<string> {
    let atual = id;
    const vistos = new Set<string>();
    while (!vistos.has(atual)) {
      vistos.add(atual);
      const c = await tx.conta.findUnique({
        where: { id: atual },
        select: { mergedPara: true },
      });
      if (!c || c.mergedPara == null) return atual;
      atual = c.mergedPara;
    }
    return atual;
  }

  async listar(params: {
    q?: string;
    pagina: number;
    tamanho: number;
    incluirUnificadas: boolean;
  }): Promise<{
    itens: {
      id: string;
      nome: string;
      tipo: string;
      totalPessoas: number;
      unificada: boolean;
    }[];
    total: number;
  }> {
    const { q, pagina, tamanho, incluirUnificadas } = params;
    const where: Prisma.ContaWhereInput = {};
    if (!incluirUnificadas) where.mergedPara = null;
    if (q && q.trim()) where.nome = { contains: q.trim(), mode: 'insensitive' };

    const [total, contas] = await Promise.all([
      this.prisma.conta.count({ where }),
      this.prisma.conta.findMany({
        where,
        orderBy: [{ nome: 'asc' }, { id: 'asc' }],
        skip: (pagina - 1) * tamanho,
        take: tamanho,
        select: {
          id: true,
          nome: true,
          tipo: true,
          mergedPara: true,
          _count: { select: { pessoas: true } },
        },
      }),
    ]);
    return {
      total,
      itens: contas.map((c) => ({
        id: c.id,
        nome: c.nome,
        tipo: c.tipo,
        totalPessoas: c._count.pessoas,
        unificada: c.mergedPara != null,
      })),
    };
  }

  async detalhe(id: string, tx: Tx = this.prisma): Promise<ContaDetalheView | null> {
    const c = await tx.conta.findUnique({
      where: { id },
      select: {
        id: true,
        nome: true,
        tipo: true,
        mergedPara: true,
        pessoas: { select: { id: true, nome: true }, orderBy: { nome: 'asc' } },
      },
    });
    if (!c) return null;
    const merges = await tx.mergeConta.findMany({
      where: { OR: [{ sobreviventeId: id }, { absorvidaId: id }] },
      orderBy: { quando: 'desc' },
      select: {
        id: true,
        sobreviventeId: true,
        absorvidaId: true,
        quando: true,
        estado: true,
        autor: true,
      },
    });
    return {
      id: c.id,
      nome: c.nome,
      tipo: c.tipo,
      mergedPara: c.mergedPara,
      pessoas: c.pessoas,
      merges: merges.map((m) => ({
        id: m.id,
        papel: m.sobreviventeId === id ? 'sobrevivente' : 'absorvida',
        absorvidaId: m.absorvidaId,
        sobreviventeId: m.sobreviventeId,
        quando: m.quando,
        estado: m.estado.toLowerCase(),
        autor: m.autor,
      })),
    };
  }

  async montarSnapshot(id: string, tx: Tx = this.prisma): Promise<SnapshotConta> {
    const d = await this.detalhe(id, tx);
    if (!d) throw new Error(`conta ${id} não encontrada para snapshot`);
    return {
      id: d.id,
      nome: d.nome,
      tipo: d.tipo,
      membros: d.pessoas.map((p) => p.id),
    };
  }
}
