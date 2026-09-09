import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EntidadeId } from '../../core/core.module';
import { PrismaService } from '../../prisma/prisma.service';

export type ValorCampoPessoaRow = Prisma.ValorCampoPessoaGetPayload<{
  include: { definicao: true };
}>;

/**
 * Valores de campo personalizado de `pessoa` (spec 013, CL-02). Espelha
 * `crm/infra/lead/valor-campo.repository.ts` (spec 008).
 */
@Injectable()
export class ValorCampoPessoaRepository {
  constructor(private readonly prisma: PrismaService) {}

  pessoaExiste(pessoaId: string): Promise<boolean> {
    return this.prisma.pessoa
      .findUnique({ where: { id: pessoaId }, select: { id: true } })
      .then((r) => r != null);
  }

  porPessoa(pessoaId: string): Promise<ValorCampoPessoaRow[]> {
    return this.prisma.valorCampoPessoa.findMany({
      where: { pessoaId },
      include: { definicao: true },
    });
  }

  /** Aplica um diff calculado pelo serviço, numa transação. */
  async aplicar(
    pessoaId: string,
    upserts: { definicaoId: string; valor: string }[],
    remover: string[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const u of upserts) {
        await tx.valorCampoPessoa.upsert({
          where: { pessoaId_definicaoId: { pessoaId, definicaoId: u.definicaoId } },
          create: {
            id: EntidadeId.novo().value,
            pessoaId,
            definicaoId: u.definicaoId,
            valor: u.valor,
          },
          update: { valor: u.valor },
        });
      }
      if (remover.length > 0) {
        await tx.valorCampoPessoa.deleteMany({
          where: { pessoaId, definicaoId: { in: remover } },
        });
      }
    });
  }
}
