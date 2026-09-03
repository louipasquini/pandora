import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { agoraUtc } from '../../core/core.module';
import { PrismaService } from '../../prisma/prisma.service';
import {
  normalizarChaves,
  resolverIdentidade,
  type DadosIdentidade,
  type ResultadoResolverOuCriar,
} from '../domain';
import { PessoaRepository } from '../infra/pessoa.repository';
import { NotaReconciliacaoService } from './nota-reconciliacao.service';

export interface OrigemDados {
  plataformaOrigem: string;
  refs: { tipoRef: string; valorRef: string }[];
}
export interface OpcoesResolver {
  /** `false` = venda de afiliada (regra inviolável #8): nunca cria pessoa. */
  criar: boolean;
  origem: OrigemDados;
}

/**
 * `resolverOuCriar` (spec 005, US2) — o ponto único de escrita **derivada** de
 * `pessoa`. É a porta que a spec 018 (pipeline, etapa "resolver pessoa") consome.
 * Idempotente (chaves normalizadas `@@unique`). Curadoria nunca é sobrescrita —
 * conflito gera `nota_reconciliacao` e o valor curado prevalece (Princípio VII).
 */
@Injectable()
export class ResolverOuCriarService {
  private readonly logger = new Logger(ResolverOuCriarService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: PessoaRepository,
    private readonly notas: NotaReconciliacaoService,
  ) {}

  async resolverOuCriar(
    dados: DadosIdentidade,
    opts: OpcoesResolver,
  ): Promise<ResultadoResolverOuCriar> {
    const chaves = normalizarChaves({
      documento: dados.documento ?? null,
      email: dados.email ?? null,
      telefone: dados.telefone ?? null,
    });
    for (const d of chaves.descartadas) {
      this.logger.debug(`chave descartada em resolverOuCriar: ${d.campo} (${d.motivo})`);
    }

    const candidatos = await this.repo.candidatosPara(chaves);
    const r = resolverIdentidade(dados, candidatos);
    const quando = agoraUtc();

    if (r.pessoaId != null) {
      const pessoaId = r.pessoaId;
      let notas = 0;
      await this.prisma.$transaction(async (tx) => {
        for (const ref of opts.origem.refs) {
          await this.repo.upsertOrigemRef(tx, pessoaId, {
            plataformaOrigem: opts.origem.plataformaOrigem,
            tipoRef: ref.tipoRef,
            valorRef: ref.valorRef,
          });
        }
        notas += await this.aplicarContato(tx, pessoaId, 'email', chaves.email, quando);
        notas += await this.aplicarContato(
          tx,
          pessoaId,
          'telefone',
          chaves.telefone,
          quando,
        );
      });
      return { pessoaId, criada: false, candidatos: r.candidatos, notas };
    }

    if (!opts.criar) {
      return { pessoaId: null, criada: false, candidatos: r.candidatos, notas: 0 };
    }

    // cria — mesmo sob ambiguidade (nunca funde os ambíguos; devolve candidatos)
    const emails = chaves.email ? [{ valor: chaves.email, curado: false }] : [];
    const telefones = chaves.telefone
      ? [{ valor: chaves.telefone, curado: false }]
      : [];
    const documentos: { tipo: 'CPF' | 'CNPJ'; valor: string; curado: boolean }[] = [];
    if (chaves.documento)
      documentos.push({ tipo: 'CPF', valor: chaves.documento, curado: false });
    if (chaves.cnpj)
      documentos.push({ tipo: 'CNPJ', valor: chaves.cnpj, curado: false });

    const novoId = await this.prisma.$transaction((tx) =>
      this.repo.criarPessoaCompleta(tx, {
        nome: dados.nome?.trim() || '(sem nome)',
        emails,
        telefones,
        documentos,
        origemRefs: opts.origem.refs.map((ref) => ({
          plataformaOrigem: opts.origem.plataformaOrigem,
          tipoRef: ref.tipoRef,
          valorRef: ref.valorRef,
        })),
      }),
    );
    return { pessoaId: novoId, criada: true, candidatos: r.candidatos, notas: 0 };
  }

  /** Aplica um contato derivado a uma pessoa já resolvida. Retorna 1 se gerou nota. */
  private async aplicarContato(
    tx: Prisma.TransactionClient,
    pessoaId: string,
    kind: 'email' | 'telefone',
    valor: string | undefined,
    quando: Date,
  ): Promise<number> {
    if (!valor) return 0;
    const primario = await this.repo.primario(tx, pessoaId, kind);
    if (primario && primario.valor === valor) return 0; // já é o primário — no-op

    if (primario && primario.curado) {
      // curadoria prevalece — novo entra como secundário + nota
      await this.repo.inserirSecundario(tx, pessoaId, kind, valor, false, quando);
      await this.notas.registrar(
        {
          entidade: 'pessoa',
          entidadeId: pessoaId,
          origem: 'resolver_ou_criar',
          campo: `${kind}_primario`,
          valorCurado: primario.valor,
          valorDerivado: valor,
          motivo: 'primario_curado',
        },
        tx,
      );
      return 1;
    }

    await this.repo.rotacionarContato(tx, pessoaId, kind, valor, false, quando);
    return 0;
  }
}
