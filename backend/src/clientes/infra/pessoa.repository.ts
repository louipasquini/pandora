import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { EntidadeId } from '../../core/core.module';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  ChavesIdentidade,
  PessoaCandidata,
  SnapshotContato,
  SnapshotPessoa,
} from '../domain';

/** Aceita o cliente normal ou um cliente de transação. */
export type Tx = PrismaService | Prisma.TransactionClient;

export interface ContatoView {
  valor: string;
  primario: boolean;
  curado: boolean;
  rebaixadoEm: Date | null;
}
export interface PessoaDetalheView {
  id: string;
  nome: string;
  tipo: string;
  pseudonimizadaEm: Date | null;
  mergedPara: string | null;
  conta: { id: string; nome: string; tipo: string } | null;
  emails: ContatoView[];
  telefones: ContatoView[];
  documentos: { tipo: string; valor: string; curado: boolean }[];
  enderecos: Record<string, unknown>[];
  origemRefs: { plataformaOrigem: string; tipoRef: string; valorRef: string }[];
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

export interface PessoaListaItem {
  id: string;
  nome: string;
  tipo: string;
  emailPrimario: string | null;
  telefonePrimario: string | null;
  documentos: string[];
  contaId: string | null;
  unificada: boolean;
}

@Injectable()
export class PessoaRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------- dedup

  /** Candidatos para dedup: pessoas que casam alguma chave normalizada. */
  async candidatosPara(chaves: ChavesIdentidade): Promise<PessoaCandidata[]> {
    const ors: Prisma.PessoaWhereInput[] = [];
    if (chaves.documento || chaves.cnpj) {
      const valores = [chaves.documento, chaves.cnpj].filter(Boolean) as string[];
      ors.push({ documentos: { some: { valor: { in: valores } } } });
    }
    if (chaves.email) ors.push({ emails: { some: { valor: chaves.email } } });
    if (chaves.telefone)
      ors.push({ telefones: { some: { valor: chaves.telefone } } });
    if (ors.length === 0) return [];

    const pessoas = await this.prisma.pessoa.findMany({
      where: { OR: ors },
      select: {
        id: true,
        mergedPara: true,
        documentos: { select: { tipo: true, valor: true } },
        emails: { select: { valor: true } },
        telefones: { select: { valor: true } },
      },
    });
    return pessoas.map((p) => ({
      id: p.id,
      mergedPara: p.mergedPara,
      documentos: p.documentos.filter((d) => d.tipo === 'CPF').map((d) => d.valor),
      cnpjs: p.documentos.filter((d) => d.tipo === 'CNPJ').map((d) => d.valor),
      emails: p.emails.map((e) => e.valor),
      telefones: p.telefones.map((t) => t.valor),
    }));
  }

  /** Segue `mergedPara` até a raiz ativa. */
  async raizAtiva(id: string, tx: Tx = this.prisma): Promise<string> {
    let atual = id;
    const vistos = new Set<string>();
    while (!vistos.has(atual)) {
      vistos.add(atual);
      const p = await tx.pessoa.findUnique({
        where: { id: atual },
        select: { mergedPara: true },
      });
      if (!p || p.mergedPara == null) return atual;
      atual = p.mergedPara;
    }
    return atual;
  }

  /** Qual `pessoa` ATIVA é dona de um contato/documento (para 409 sem fundir). */
  async donoDoContato(
    kind: 'email' | 'telefone',
    valor: string,
  ): Promise<string | null> {
    const where = { valor, pessoa: { mergedPara: null } };
    const linha =
      kind === 'email'
        ? await this.prisma.pessoaEmail.findFirst({ where, select: { pessoaId: true } })
        : await this.prisma.pessoaTelefone.findFirst({ where, select: { pessoaId: true } });
    return linha?.pessoaId ?? null;
  }

  async donoDoDocumento(tipo: 'CPF' | 'CNPJ', valor: string): Promise<string | null> {
    const linha = await this.prisma.pessoaDocumento.findFirst({
      where: { tipo, valor, pessoa: { mergedPara: null } },
      select: { pessoaId: true },
    });
    return linha?.pessoaId ?? null;
  }

  // ---------------------------------------------------------------- escrita derivada

  novoId(): string {
    return EntidadeId.novo().value;
  }

  async criarPessoaCompleta(
    tx: Tx,
    dados: {
      nome: string;
      tipo?: string;
      contaId?: string | null;
      emails?: { valor: string; curado: boolean }[];
      telefones?: { valor: string; curado: boolean }[];
      documentos?: { tipo: 'CPF' | 'CNPJ'; valor: string; curado: boolean }[];
      enderecos?: Record<string, unknown>[];
      origemRefs?: { plataformaOrigem: string; tipoRef: string; valorRef: string }[];
    },
  ): Promise<string> {
    const id = this.novoId();
    await tx.pessoa.create({
      data: {
        id,
        nome: dados.nome,
        tipo: (dados.tipo as never) ?? 'DESCONHECIDO',
        contaId: dados.contaId ?? null,
        emails: {
          create: (dados.emails ?? []).map((e, i) => ({
            id: this.novoId(),
            valor: e.valor,
            primario: i === 0,
            curado: e.curado,
          })),
        },
        telefones: {
          create: (dados.telefones ?? []).map((t, i) => ({
            id: this.novoId(),
            valor: t.valor,
            primario: i === 0,
            curado: t.curado,
          })),
        },
        documentos: {
          create: (dados.documentos ?? []).map((d) => ({
            id: this.novoId(),
            tipo: d.tipo as never,
            valor: d.valor,
            curado: d.curado,
          })),
        },
        enderecos: {
          create: (dados.enderecos ?? []).map((en) => ({
            id: this.novoId(),
            ...(en as object),
          })) as never,
        },
        origemRefs: {
          create: (dados.origemRefs ?? []).map((r) => ({
            id: this.novoId(),
            plataformaOrigem: r.plataformaOrigem as never,
            tipoRef: r.tipoRef,
            valorRef: r.valorRef,
          })),
        },
      },
    });
    return id;
  }

  /** Upsert idempotente de uma ref de origem. */
  async upsertOrigemRef(
    tx: Tx,
    pessoaId: string,
    r: { plataformaOrigem: string; tipoRef: string; valorRef: string },
  ): Promise<void> {
    await tx.pessoaOrigemRef.upsert({
      where: {
        plataformaOrigem_tipoRef_valorRef: {
          plataformaOrigem: r.plataformaOrigem as never,
          tipoRef: r.tipoRef,
          valorRef: r.valorRef,
        },
      },
      create: {
        id: this.novoId(),
        pessoaId,
        plataformaOrigem: r.plataformaOrigem as never,
        tipoRef: r.tipoRef,
        valorRef: r.valorRef,
      },
      update: {},
    });
  }

  /** Contato atual primário de um tipo. */
  async primario(
    tx: Tx,
    pessoaId: string,
    kind: 'email' | 'telefone',
  ): Promise<{ id: string; valor: string; curado: boolean } | null> {
    const where = { pessoaId, primario: true };
    const select = { id: true, valor: true, curado: true } as const;
    const l =
      kind === 'email'
        ? await tx.pessoaEmail.findFirst({ where, select })
        : await tx.pessoaTelefone.findFirst({ where, select });
    return l ?? null;
  }

  async contatoPorValor(
    tx: Tx,
    pessoaId: string,
    kind: 'email' | 'telefone',
    valor: string,
  ): Promise<{ id: string; primario: boolean } | null> {
    const where = { pessoaId, valor };
    const select = { id: true, primario: true } as const;
    const l =
      kind === 'email'
        ? await tx.pessoaEmail.findFirst({ where, select })
        : await tx.pessoaTelefone.findFirst({ where, select });
    return l ?? null;
  }

  private async atualizarContato(
    tx: Tx,
    kind: 'email' | 'telefone',
    id: string,
    data: Prisma.PessoaEmailUpdateInput,
  ): Promise<void> {
    if (kind === 'email') await tx.pessoaEmail.update({ where: { id }, data });
    else await tx.pessoaTelefone.update({ where: { id }, data });
  }

  private async criarContato(
    tx: Tx,
    kind: 'email' | 'telefone',
    data: Prisma.PessoaEmailUncheckedCreateInput,
  ): Promise<void> {
    if (kind === 'email') await tx.pessoaEmail.create({ data });
    else await tx.pessoaTelefone.create({ data });
  }

  /**
   * Rotaciona o primário: `novoValor` vira primário, o antigo desce a secundário
   * com `rebaixadoEm`. Se `novoValor` já é secundário, promove-o.
   */
  async rotacionarContato(
    tx: Tx,
    pessoaId: string,
    kind: 'email' | 'telefone',
    novoValor: string,
    curado: boolean,
    quando: Date,
  ): Promise<void> {
    const antigo = await this.primario(tx, pessoaId, kind);
    if (antigo && antigo.valor !== novoValor) {
      await this.atualizarContato(tx, kind, antigo.id, {
        primario: false,
        rebaixadoEm: quando,
      });
    }
    const existente = await this.contatoPorValor(tx, pessoaId, kind, novoValor);
    if (existente) {
      await this.atualizarContato(tx, kind, existente.id, {
        primario: true,
        rebaixadoEm: null,
        ...(curado ? { curado: true } : {}),
      });
    } else {
      await this.criarContato(tx, kind, {
        id: this.novoId(),
        pessoaId,
        valor: novoValor,
        primario: true,
        curado,
      });
    }
  }

  /** Insere um contato como SECUNDÁRIO (sem tocar o primário). */
  async inserirSecundario(
    tx: Tx,
    pessoaId: string,
    kind: 'email' | 'telefone',
    valor: string,
    curado: boolean,
    quando: Date,
  ): Promise<void> {
    const existente = await this.contatoPorValor(tx, pessoaId, kind, valor);
    if (existente) return;
    await this.criarContato(tx, kind, {
      id: this.novoId(),
      pessoaId,
      valor,
      primario: false,
      curado,
      rebaixadoEm: quando,
    });
  }

  // ---------------------------------------------------------------- leitura

  async listar(params: {
    q?: string;
    pagina: number;
    tamanho: number;
    incluirUnificadas: boolean;
  }): Promise<{ itens: PessoaListaItem[]; total: number }> {
    const { q, pagina, tamanho, incluirUnificadas } = params;
    const where: Prisma.PessoaWhereInput = {};
    if (!incluirUnificadas) where.mergedPara = null;
    if (q && q.trim()) {
      const termo = q.trim();
      const soDigitos = termo.replace(/\D+/g, '');
      where.OR = [
        { nome: { contains: termo, mode: 'insensitive' } },
        { emails: { some: { valor: { contains: termo.toLowerCase() } } } },
        { telefones: { some: { valor: { contains: soDigitos || termo } } } },
        ...(soDigitos
          ? [{ documentos: { some: { valor: { contains: soDigitos } } } } as Prisma.PessoaWhereInput]
          : []),
      ];
    }
    const [total, pessoas] = await Promise.all([
      this.prisma.pessoa.count({ where }),
      this.prisma.pessoa.findMany({
        where,
        orderBy: [{ nome: 'asc' }, { id: 'asc' }],
        skip: (pagina - 1) * tamanho,
        take: tamanho,
        select: {
          id: true,
          nome: true,
          tipo: true,
          contaId: true,
          mergedPara: true,
          emails: { where: { primario: true }, select: { valor: true } },
          telefones: { where: { primario: true }, select: { valor: true } },
          documentos: { select: { valor: true } },
        },
      }),
    ]);
    return {
      total,
      itens: pessoas.map((p) => ({
        id: p.id,
        nome: p.nome,
        tipo: p.tipo,
        emailPrimario: p.emails[0]?.valor ?? null,
        telefonePrimario: p.telefones[0]?.valor ?? null,
        documentos: p.documentos.map((d) => d.valor),
        contaId: p.contaId,
        unificada: p.mergedPara != null,
      })),
    };
  }

  async detalhe(id: string, tx: Tx = this.prisma): Promise<PessoaDetalheView | null> {
    const p = await tx.pessoa.findUnique({
      where: { id },
      select: {
        id: true,
        nome: true,
        tipo: true,
        pseudonimizadaEm: true,
        mergedPara: true,
        conta: { select: { id: true, nome: true, tipo: true } },
        emails: {
          select: { valor: true, primario: true, curado: true, rebaixadoEm: true },
          orderBy: [{ primario: 'desc' }, { valor: 'asc' }],
        },
        telefones: {
          select: { valor: true, primario: true, curado: true, rebaixadoEm: true },
          orderBy: [{ primario: 'desc' }, { valor: 'asc' }],
        },
        documentos: { select: { tipo: true, valor: true, curado: true } },
        enderecos: true,
        origemRefs: {
          select: { plataformaOrigem: true, tipoRef: true, valorRef: true },
        },
      },
    });
    if (!p) return null;

    const merges = await tx.mergePessoa.findMany({
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
      id: p.id,
      nome: p.nome,
      tipo: p.tipo,
      pseudonimizadaEm: p.pseudonimizadaEm,
      mergedPara: p.mergedPara,
      conta: p.conta,
      emails: p.emails,
      telefones: p.telefones,
      documentos: p.documentos,
      enderecos: p.enderecos as unknown as Record<string, unknown>[],
      origemRefs: p.origemRefs,
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

  // ---------------------------------------------------------------- snapshot p/ merge

  async montarSnapshot(id: string, tx: Tx = this.prisma): Promise<SnapshotPessoa> {
    const d = await this.detalhe(id, tx);
    if (!d) throw new Error(`pessoa ${id} não encontrada para snapshot`);
    const contato = (c: ContatoView): SnapshotContato => ({
      valor: c.valor,
      primario: c.primario,
      curado: c.curado,
      rebaixadoEm: c.rebaixadoEm ? c.rebaixadoEm.toISOString() : null,
    });
    return {
      id: d.id,
      nome: d.nome,
      tipo: d.tipo,
      contaId: d.conta?.id ?? null,
      emails: d.emails.map(contato),
      telefones: d.telefones.map(contato),
      documentos: d.documentos.map((x) => ({
        tipo: x.tipo as 'CPF' | 'CNPJ',
        valor: x.valor,
        curado: x.curado,
      })),
      enderecos: d.enderecos.map((e) => ({
        logradouro: String(e.logradouro ?? ''),
        numero: (e.numero as string) ?? null,
        complemento: (e.complemento as string) ?? null,
        bairro: (e.bairro as string) ?? null,
        cidade: (e.cidade as string) ?? null,
        uf: (e.uf as string) ?? null,
        cep: (e.cep as string) ?? null,
        pais: String(e.pais ?? 'BR'),
        curado: Boolean(e.curado),
      })),
      origemRefs: d.origemRefs,
    };
  }
}
