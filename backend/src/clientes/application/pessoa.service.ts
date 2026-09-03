import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { agoraUtc } from '../../core/core.module';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizarDocumento, normalizarEmail, normalizarTelefone } from '../domain';
import {
  PessoaRepository,
  type PessoaDetalheView,
  type PessoaListaItem,
} from '../infra/pessoa.repository';
import { ClientesAuditService } from './clientes-audit.service';
import type {
  CriarPessoaDto,
  ListaQueryDto,
  PatchPessoaDto,
} from '../dto/pessoa.schema';

export interface PessoaDetalheResposta extends PessoaDetalheView {
  unificacao?: { deId: string; em: Date; mergeId: string };
}

@Injectable()
export class PessoaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: PessoaRepository,
    private readonly audit: ClientesAuditService,
  ) {}

  async listar(
    q: ListaQueryDto,
  ): Promise<{ itens: PessoaListaItem[]; pagina: number; tamanho: number; total: number }> {
    const { itens, total } = await this.repo.listar({
      q: q.q,
      pagina: q.pagina,
      tamanho: q.tamanho,
      incluirUnificadas: q.incluirUnificadas ?? false,
    });
    return { itens, pagina: q.pagina, tamanho: q.tamanho, total };
  }

  /** Resolve `mergedPara` — devolve sempre a sobrevivente ativa, com `unificacao`. */
  async verDetalhe(id: string): Promise<PessoaDetalheResposta> {
    const alvo = await this.repo.detalhe(id);
    if (!alvo) throw new NotFoundException('pessoa não encontrada');
    if (alvo.mergedPara == null) return alvo;

    const raiz = await this.repo.raizAtiva(id);
    const sobrevivente = await this.repo.detalhe(raiz);
    if (!sobrevivente) throw new NotFoundException('pessoa não encontrada');
    const merge = alvo.merges.find(
      (m) => m.papel === 'absorvida' && m.estado === 'ativo',
    );
    return {
      ...sobrevivente,
      unificacao: {
        deId: id,
        em: merge?.quando ?? sobrevivente.merges[0]?.quando ?? agoraUtc(),
        mergeId: merge?.id ?? '',
      },
    };
  }

  // ---------------------------------------------------------------- criar

  async criar(dto: CriarPessoaDto, autor: string): Promise<PessoaDetalheResposta> {
    const emails = (dto.emails ?? []).map((v) => this.exigirEmail(v));
    const telefones = (dto.telefones ?? []).map((v) => this.exigirTelefone(v));
    const documentos = (dto.documentos ?? []).map((v) => this.exigirDocumento(v));

    if (dto.contaId) {
      const c = await this.prisma.conta.findUnique({ where: { id: dto.contaId } });
      if (!c) throw new NotFoundException('conta não encontrada');
    }

    for (const e of emails) await this.exigirContatoLivre('email', e);
    for (const t of telefones) await this.exigirContatoLivre('telefone', t);
    for (const d of documentos) await this.exigirDocumentoLivre(d.tipo, d.valor);

    const id = await this.prisma.$transaction((tx) =>
      this.repo.criarPessoaCompleta(tx, {
        nome: dto.nome.trim(),
        tipo: dto.tipo,
        contaId: dto.contaId ?? null,
        emails: emails.map((v) => ({ valor: v, curado: true })),
        telefones: telefones.map((v) => ({ valor: v, curado: true })),
        documentos: documentos.map((d) => ({ ...d, curado: true })),
        enderecos: (dto.enderecos ?? []) as unknown as Record<string, unknown>[],
      }),
    );

    await this.audit.registrar({
      autor,
      entidade: 'pessoa',
      entidadeId: id,
      campo: 'criado',
      valorAnterior: null,
      valorNovo: {
        nome: dto.nome.trim(),
        tipo: dto.tipo ?? 'DESCONHECIDO',
        emails,
        telefones,
        documentos,
      },
      motivo: 'pessoa criada manualmente',
    });
    return (await this.repo.detalhe(id))!;
  }

  // ---------------------------------------------------------------- patch

  async patch(
    id: string,
    dto: PatchPessoaDto,
    autor: string,
  ): Promise<PessoaDetalheResposta> {
    const atual = await this.repo.detalhe(id);
    if (!atual) throw new NotFoundException('pessoa não encontrada');
    if (atual.mergedPara != null)
      throw new ConflictException('pessoa unificada — edite a sobrevivente');

    const addEmails = (dto.adicionarEmails ?? []).map((v) => this.exigirEmail(v));
    const addTels = (dto.adicionarTelefones ?? []).map((v) => this.exigirTelefone(v));
    const addDocs = (dto.adicionarDocumentos ?? []).map((v) => this.exigirDocumento(v));
    for (const e of addEmails) await this.exigirContatoLivre('email', e, id);
    for (const t of addTels) await this.exigirContatoLivre('telefone', t, id);
    for (const d of addDocs) await this.exigirDocumentoLivre(d.tipo, d.valor, id);

    const quando = agoraUtc();
    const eventos: {
      campo: string;
      antes: unknown;
      depois: unknown;
      motivo: string;
    }[] = [];

    await this.prisma.$transaction(async (tx) => {
      if (dto.nome != null && dto.nome.trim() !== atual.nome) {
        await tx.pessoa.update({
          where: { id },
          data: { nome: dto.nome.trim() },
        });
        eventos.push({
          campo: 'nome',
          antes: atual.nome,
          depois: dto.nome.trim(),
          motivo: 'nome editado manualmente',
        });
      }
      if (dto.tipo != null && dto.tipo !== atual.tipo) {
        await tx.pessoa.update({ where: { id }, data: { tipo: dto.tipo } });
        eventos.push({
          campo: 'tipo',
          antes: atual.tipo,
          depois: dto.tipo,
          motivo: 'tipo editado manualmente',
        });
      }

      // remoções
      for (const v of dto.removerEmails ?? [])
        await tx.pessoaEmail.deleteMany({ where: { pessoaId: id, valor: this.normEmailOuOriginal(v) } });
      for (const v of dto.removerTelefones ?? [])
        await tx.pessoaTelefone.deleteMany({ where: { pessoaId: id, valor: this.normTelOuOriginal(v) } });
      for (const v of dto.removerDocumentos ?? []) {
        const d = normalizarDocumento(v);
        if (d.descartada == null)
          await tx.pessoaDocumento.deleteMany({
            where: { pessoaId: id, tipo: d.valor.tipo, valor: d.valor.valor },
          });
      }

      // adições (curado: true — ato manual)
      for (const v of addEmails)
        await this.repo.inserirSecundario(tx, id, 'email', v, true, quando);
      for (const v of addTels)
        await this.repo.inserirSecundario(tx, id, 'telefone', v, true, quando);
      for (const d of addDocs)
        await tx.pessoaDocumento.create({
          data: {
            id: this.repo.novoId(),
            pessoaId: id,
            tipo: d.tipo,
            valor: d.valor,
            curado: true,
          },
        });

      // primários explícitos
      if (dto.emailPrimario !== undefined && dto.emailPrimario !== null) {
        const v = this.exigirEmail(dto.emailPrimario);
        const existe = await this.repo.contatoPorValor(tx, id, 'email', v);
        if (!existe) throw new BadRequestException('emailPrimario não pertence à pessoa');
        await this.repo.rotacionarContato(tx, id, 'email', v, true, quando);
        eventos.push({
          campo: 'email_primario',
          antes: atual.emails.find((e) => e.primario)?.valor ?? null,
          depois: v,
          motivo: 'primário de e-mail definido manualmente',
        });
      }
      if (dto.telefonePrimario !== undefined && dto.telefonePrimario !== null) {
        const v = this.exigirTelefone(dto.telefonePrimario);
        const existe = await this.repo.contatoPorValor(tx, id, 'telefone', v);
        if (!existe)
          throw new BadRequestException('telefonePrimario não pertence à pessoa');
        await this.repo.rotacionarContato(tx, id, 'telefone', v, true, quando);
        eventos.push({
          campo: 'telefone_primario',
          antes: atual.telefones.find((t) => t.primario)?.valor ?? null,
          depois: v,
          motivo: 'primário de telefone definido manualmente',
        });
      }

      if (dto.enderecos !== undefined) {
        await tx.pessoaEndereco.deleteMany({ where: { pessoaId: id } });
        for (const en of dto.enderecos) {
          await tx.pessoaEndereco.create({
            data: {
              id: this.repo.novoId(),
              pessoaId: id,
              curado: true,
              ...(en as object),
            } as Prisma.PessoaEnderecoUncheckedCreateInput,
          });
        }
        eventos.push({
          campo: 'enderecos',
          antes: atual.enderecos,
          depois: dto.enderecos,
          motivo: 'endereços editados manualmente',
        });
      }

      if (dto.adicionarEmails?.length || dto.removerEmails?.length)
        eventos.push({
          campo: 'emails',
          antes: atual.emails.map((e) => e.valor),
          depois: 'alterado',
          motivo: 'contatos de e-mail editados manualmente',
        });
      if (dto.adicionarTelefones?.length || dto.removerTelefones?.length)
        eventos.push({
          campo: 'telefones',
          antes: atual.telefones.map((t) => t.valor),
          depois: 'alterado',
          motivo: 'contatos de telefone editados manualmente',
        });
      if (dto.adicionarDocumentos?.length || dto.removerDocumentos?.length)
        eventos.push({
          campo: 'documentos',
          antes: atual.documentos.map((d) => d.valor),
          depois: 'alterado',
          motivo: 'documentos editados manualmente',
        });
    });

    // trava: pessoa não pode ficar sem nenhuma âncora de identidade
    const depois = await this.repo.detalhe(id);
    if (
      depois &&
      depois.emails.length === 0 &&
      depois.telefones.length === 0 &&
      depois.documentos.length === 0
    ) {
      throw new BadRequestException(
        'pessoa precisa manter ao menos um e-mail, telefone ou documento',
      );
    }

    for (const ev of eventos) {
      await this.audit.registrar({
        autor,
        entidade: 'pessoa',
        entidadeId: id,
        campo: ev.campo === 'nome' || ev.campo === 'tipo' ? ev.campo : 'editado',
        valorAnterior: ev.antes,
        valorNovo: ev.depois,
        motivo: ev.motivo,
      });
    }
    return (await this.repo.detalhe(id))!;
  }

  // ---------------------------------------------------------------- helpers

  private exigirEmail(bruto: string): string {
    const r = normalizarEmail(bruto);
    if (r.descartada != null)
      throw new BadRequestException(`e-mail inválido: ${r.descartada}`);
    return r.valor;
  }
  private exigirTelefone(bruto: string): string {
    const r = normalizarTelefone(bruto);
    if (r.descartada != null)
      throw new BadRequestException(`telefone inválido: ${r.descartada}`);
    return r.valor;
  }
  private exigirDocumento(bruto: string): { tipo: 'CPF' | 'CNPJ'; valor: string } {
    const r = normalizarDocumento(bruto);
    if (r.descartada != null)
      throw new BadRequestException(`documento inválido: ${r.descartada}`);
    return r.valor;
  }
  private normEmailOuOriginal(v: string): string {
    const r = normalizarEmail(v);
    return r.descartada != null ? v : r.valor;
  }
  private normTelOuOriginal(v: string): string {
    const r = normalizarTelefone(v);
    return r.descartada != null ? v : r.valor;
  }

  private async exigirContatoLivre(
    kind: 'email' | 'telefone',
    valor: string,
    excetoPessoaId?: string,
  ): Promise<void> {
    const dono = await this.repo.donoDoContato(kind, valor);
    if (dono && dono !== excetoPessoaId) {
      throw new ConflictException({
        message: 'contato já pertence a outra pessoa',
        campo: kind,
        pessoaId: dono,
      });
    }
  }
  private async exigirDocumentoLivre(
    tipo: 'CPF' | 'CNPJ',
    valor: string,
    excetoPessoaId?: string,
  ): Promise<void> {
    const dono = await this.repo.donoDoDocumento(tipo, valor);
    if (dono && dono !== excetoPessoaId) {
      throw new ConflictException({
        message: 'documento já pertence a outra pessoa',
        campo: 'documento',
        pessoaId: dono,
      });
    }
  }
}
