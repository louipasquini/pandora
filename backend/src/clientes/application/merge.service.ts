import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { EntidadeId, agoraUtc } from '../../core/core.module';
import { PrismaService } from '../../prisma/prisma.service';
import {
  planoDeReversao,
  type LinhaProvenienciada,
  type SnapshotMergePessoa,
} from '../domain/merge-plano';
import { PessoaRepository } from '../infra/pessoa.repository';
import { ContaRepository } from '../infra/conta.repository';
import { ClientesAuditService } from './clientes-audit.service';
import { NotaReconciliacaoService } from './nota-reconciliacao.service';

@Injectable()
export class MergeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pessoas: PessoaRepository,
    private readonly contas: ContaRepository,
    private readonly audit: ClientesAuditService,
    private readonly notas: NotaReconciliacaoService,
  ) {}

  // ============================================================ pessoa

  async mergePessoa(
    sobreviventeId: string,
    absorvidaId: string,
    autor: string,
  ): Promise<void> {
    if (sobreviventeId === absorvidaId)
      throw new BadRequestException('sobrevivente e absorvida não podem ser a mesma pessoa');

    const [sobr, abs] = await Promise.all([
      this.prisma.pessoa.findUnique({ where: { id: sobreviventeId } }),
      this.prisma.pessoa.findUnique({ where: { id: absorvidaId } }),
    ]);
    if (!sobr || !abs) throw new NotFoundException('pessoa não encontrada');
    if (sobr.mergedPara != null || abs.mergedPara != null)
      throw new ConflictException('pessoa já unificada');

    const mergeId = EntidadeId.novo().value;
    const quando = agoraUtc();
    const snapshot: SnapshotMergePessoa = {
      sobrevivente: await this.pessoas.montarSnapshot(sobreviventeId),
      absorvida: await this.pessoas.montarSnapshot(absorvidaId),
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.mergePessoa.create({
        data: {
          id: mergeId,
          sobreviventeId,
          absorvidaId,
          autor,
          quando,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          estado: 'ATIVO',
        },
      });
      // contatos → secundários; demais linhas → só reatribui pessoaId
      await tx.pessoaEmail.updateMany({
        where: { pessoaId: absorvidaId },
        data: { pessoaId: sobreviventeId, primario: false, rebaixadoEm: quando, origemMergeId: mergeId },
      });
      await tx.pessoaTelefone.updateMany({
        where: { pessoaId: absorvidaId },
        data: { pessoaId: sobreviventeId, primario: false, rebaixadoEm: quando, origemMergeId: mergeId },
      });
      await tx.pessoaDocumento.updateMany({
        where: { pessoaId: absorvidaId },
        data: { pessoaId: sobreviventeId, origemMergeId: mergeId },
      });
      await tx.pessoaEndereco.updateMany({
        where: { pessoaId: absorvidaId },
        data: { pessoaId: sobreviventeId, origemMergeId: mergeId },
      });
      await tx.pessoaOrigemRef.updateMany({
        where: { pessoaId: absorvidaId },
        data: { pessoaId: sobreviventeId, origemMergeId: mergeId },
      });
      await tx.pessoa.update({
        where: { id: absorvidaId },
        data: { mergedPara: sobreviventeId },
      });
    });

    await this.audit.registrar({
      autor,
      entidade: 'pessoa',
      entidadeId: sobreviventeId,
      campo: 'merge',
      valorAnterior: null,
      valorNovo: { absorvidaId, mergeId },
      motivo: 'pessoas unificadas',
    });
  }

  async desfazerMergePessoa(
    sobreviventeId: string,
    mergeId: string,
    autor: string,
  ): Promise<{ notas: number }> {
    const merge = await this.prisma.mergePessoa.findUnique({ where: { id: mergeId } });
    if (!merge || merge.sobreviventeId !== sobreviventeId)
      throw new NotFoundException('merge não encontrado para esta pessoa');
    if (merge.estado === 'DESFEITO')
      throw new ConflictException('merge já desfeito');

    const snapshot = merge.snapshot as unknown as SnapshotMergePessoa;
    const absorvidaId = merge.absorvidaId;

    // linhas que ESTE merge moveu e ainda têm a proveniência dele
    const [emails, telefones, documentos, enderecos, refs] = await Promise.all([
      this.prisma.pessoaEmail.findMany({ where: { origemMergeId: mergeId } }),
      this.prisma.pessoaTelefone.findMany({ where: { origemMergeId: mergeId } }),
      this.prisma.pessoaDocumento.findMany({ where: { origemMergeId: mergeId } }),
      this.prisma.pessoaEndereco.findMany({ where: { origemMergeId: mergeId } }),
      this.prisma.pessoaOrigemRef.findMany({ where: { origemMergeId: mergeId } }),
    ]);

    const linhas: LinhaProvenienciada[] = [
      ...emails.map((e) => ({ id: e.id, tabela: 'email' as const, chave: e.valor, curado: e.curado, primario: e.primario })),
      ...telefones.map((t) => ({ id: t.id, tabela: 'telefone' as const, chave: t.valor, curado: t.curado, primario: t.primario })),
      ...documentos.map((d) => ({ id: d.id, tabela: 'documento' as const, chave: `${d.tipo}:${d.valor}`, curado: d.curado, primario: false })),
      ...enderecos.map((en) => ({ id: en.id, tabela: 'endereco' as const, chave: en.logradouro, curado: en.curado, primario: false })),
      ...refs.map((r) => ({ id: r.id, tabela: 'origemRef' as const, chave: `${r.plataformaOrigem}:${r.tipoRef}:${r.valorRef}`, curado: false, primario: false })),
    ];

    const plano = planoDeReversao(snapshot, linhas);
    const idsMover = new Set(plano.moverParaAbsorvida);

    await this.prisma.$transaction(async (tx) => {
      // recria / religa a absorvida
      const absAtual = await tx.pessoa.findUnique({ where: { id: absorvidaId } });
      if (!absAtual) {
        await tx.pessoa.create({
          data: {
            id: absorvidaId,
            nome: snapshot.absorvida.nome,
            tipo: snapshot.absorvida.tipo as never,
            contaId: snapshot.absorvida.contaId,
          },
        });
      } else if (absAtual.mergedPara === sobreviventeId) {
        await tx.pessoa.update({ where: { id: absorvidaId }, data: { mergedPara: null } });
      } else if (absAtual.mergedPara != null) {
        await this.notas.registrar(
          {
            entidade: 'pessoa',
            entidadeId: absorvidaId,
            origem: 'merge_desfeito',
            campo: 'merged_para',
            valorCurado: absAtual.mergedPara,
            valorDerivado: null,
            motivo: 'divergiu_pos_merge',
          },
          tx,
        );
      }

      // move de volta as linhas não curadas (só as que o plano marcou)
      const back = { pessoaId: absorvidaId, origemMergeId: null };
      const eIds = emails.filter((e) => idsMover.has(e.id)).map((e) => e.id);
      const tIds = telefones.filter((t) => idsMover.has(t.id)).map((t) => t.id);
      const dIds = documentos.filter((d) => idsMover.has(d.id)).map((d) => d.id);
      const enIds = enderecos.filter((en) => idsMover.has(en.id)).map((en) => en.id);
      const rIds = refs.filter((r) => idsMover.has(r.id)).map((r) => r.id);
      if (eIds.length) await tx.pessoaEmail.updateMany({ where: { id: { in: eIds } }, data: back });
      if (tIds.length) await tx.pessoaTelefone.updateMany({ where: { id: { in: tIds } }, data: back });
      if (dIds.length) await tx.pessoaDocumento.updateMany({ where: { id: { in: dIds } }, data: back });
      if (enIds.length) await tx.pessoaEndereco.updateMany({ where: { id: { in: enIds } }, data: back });
      if (rIds.length) await tx.pessoaOrigemRef.updateMany({ where: { id: { in: rIds } }, data: back });

      // restaura o estado primário/rebaixado dos contatos da absorvida a partir do snapshot
      for (const e of snapshot.absorvida.emails) {
        await tx.pessoaEmail.updateMany({
          where: { pessoaId: absorvidaId, valor: e.valor },
          data: { primario: e.primario, rebaixadoEm: e.rebaixadoEm ? new Date(e.rebaixadoEm) : null },
        });
      }
      for (const t of snapshot.absorvida.telefones) {
        await tx.pessoaTelefone.updateMany({
          where: { pessoaId: absorvidaId, valor: t.valor },
          data: { primario: t.primario, rebaixadoEm: t.rebaixadoEm ? new Date(t.rebaixadoEm) : null },
        });
      }

      // recria filhas que sumiram (removidas por PATCH depois do merge)
      for (const e of plano.recriarNaAbsorvida.emails)
        await tx.pessoaEmail.create({ data: { id: EntidadeId.novo().value, pessoaId: absorvidaId, valor: e.valor, primario: e.primario, curado: e.curado } });
      for (const t of plano.recriarNaAbsorvida.telefones)
        await tx.pessoaTelefone.create({ data: { id: EntidadeId.novo().value, pessoaId: absorvidaId, valor: t.valor, primario: t.primario, curado: t.curado } });
      for (const d of plano.recriarNaAbsorvida.documentos)
        await tx.pessoaDocumento.create({ data: { id: EntidadeId.novo().value, pessoaId: absorvidaId, tipo: d.tipo as never, valor: d.valor, curado: d.curado } }).catch(() => undefined);
      for (const r of plano.recriarNaAbsorvida.origemRefs)
        await tx.pessoaOrigemRef.create({ data: { id: EntidadeId.novo().value, pessoaId: absorvidaId, plataformaOrigem: r.plataformaOrigem as never, tipoRef: r.tipoRef, valorRef: r.valorRef } }).catch(() => undefined);

      for (const div of plano.divergencias) {
        await this.notas.registrar(
          {
            entidade: 'pessoa',
            entidadeId: sobreviventeId,
            origem: 'merge_desfeito',
            campo: div.campo,
            valorCurado: div.valorAtual,
            valorDerivado: div.valorSnapshot,
            motivo: 'divergiu_pos_merge',
          },
          tx,
        );
      }

      await tx.mergePessoa.update({
        where: { id: mergeId },
        data: { estado: 'DESFEITO', desfeitoPor: autor, desfeitoEm: agoraUtc() },
      });
    });

    await this.audit.registrar({
      autor,
      entidade: 'pessoa',
      entidadeId: sobreviventeId,
      campo: 'merge_desfeito',
      valorAnterior: { mergeId },
      valorNovo: null,
      motivo: 'unificação de pessoas desfeita',
    });
    return { notas: plano.divergencias.length };
  }

  // ============================================================ conta

  async mergeConta(
    sobreviventeId: string,
    absorvidaId: string,
    autor: string,
  ): Promise<void> {
    if (sobreviventeId === absorvidaId)
      throw new BadRequestException('sobrevivente e absorvida não podem ser a mesma conta');
    const [sobr, abs] = await Promise.all([
      this.prisma.conta.findUnique({ where: { id: sobreviventeId } }),
      this.prisma.conta.findUnique({ where: { id: absorvidaId } }),
    ]);
    if (!sobr || !abs) throw new NotFoundException('conta não encontrada');
    if (sobr.mergedPara != null || abs.mergedPara != null)
      throw new ConflictException('conta já unificada');

    const mergeId = EntidadeId.novo().value;
    const quando = agoraUtc();
    const snapshot = {
      sobrevivente: await this.contas.montarSnapshot(sobreviventeId),
      absorvida: await this.contas.montarSnapshot(absorvidaId),
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.mergeConta.create({
        data: {
          id: mergeId,
          sobreviventeId,
          absorvidaId,
          autor,
          quando,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          estado: 'ATIVO',
        },
      });
      await tx.pessoa.updateMany({
        where: { contaId: absorvidaId },
        data: { contaId: sobreviventeId },
      });
      await tx.conta.update({
        where: { id: absorvidaId },
        data: { mergedPara: sobreviventeId },
      });
    });

    await this.audit.registrar({
      autor,
      entidade: 'conta',
      entidadeId: sobreviventeId,
      campo: 'merge',
      valorAnterior: null,
      valorNovo: { absorvidaId, mergeId },
      motivo: 'contas unificadas',
    });
  }

  async desfazerMergeConta(
    sobreviventeId: string,
    mergeId: string,
    autor: string,
  ): Promise<void> {
    const merge = await this.prisma.mergeConta.findUnique({ where: { id: mergeId } });
    if (!merge || merge.sobreviventeId !== sobreviventeId)
      throw new NotFoundException('merge não encontrado para esta conta');
    if (merge.estado === 'DESFEITO')
      throw new ConflictException('merge já desfeito');

    const snapshot = merge.snapshot as unknown as {
      absorvida: { id: string; nome: string; tipo: string; membros: string[] };
    };
    const absorvidaId = merge.absorvidaId;

    await this.prisma.$transaction(async (tx) => {
      const abs = await tx.conta.findUnique({ where: { id: absorvidaId } });
      if (!abs) {
        await tx.conta.create({
          data: {
            id: absorvidaId,
            nome: snapshot.absorvida.nome,
            tipo: snapshot.absorvida.tipo as never,
          },
        });
      } else if (abs.mergedPara === sobreviventeId) {
        await tx.conta.update({ where: { id: absorvidaId }, data: { mergedPara: null } });
      }
      // devolve só as pessoas que continuam na sobrevivente E estavam na absorvida no snapshot
      for (const pessoaId of snapshot.absorvida.membros) {
        await tx.pessoa.updateMany({
          where: { id: pessoaId, contaId: sobreviventeId },
          data: { contaId: absorvidaId },
        });
      }
      await tx.mergeConta.update({
        where: { id: mergeId },
        data: { estado: 'DESFEITO', desfeitoPor: autor, desfeitoEm: agoraUtc() },
      });
    });

    await this.audit.registrar({
      autor,
      entidade: 'conta',
      entidadeId: sobreviventeId,
      campo: 'merge_desfeito',
      valorAnterior: { mergeId },
      valorNovo: null,
      motivo: 'unificação de contas desfeita',
    });
  }
}
