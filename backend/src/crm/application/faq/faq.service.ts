import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { FaqRepository, FaqVersaoRepository, type FaqItemRow } from '../../infra/faq';
import type { AtualizarFaqItemDto, CriarFaqItemDto } from '../../dto/faq/faq.schema';

function projetar(f: FaqItemRow) {
  return {
    id: f.id,
    pergunta: f.pergunta,
    resposta: f.resposta,
    ativo: f.ativo,
    criadoEm: f.criadoEm,
    atualizadoEm: f.atualizadoEm,
  };
}

/**
 * CRUD + versionamento de `FaqItem` (spec 013, FR-001/FR-002). Toda edição de
 * `pergunta`/`resposta` que muda de valor gera uma nova `FaqItemVersao`
 * (snapshot completo, research.md D-R1) — `ativo` sozinho não gera versão.
 */
@Injectable()
export class FaqService {
  constructor(
    private readonly repo: FaqRepository,
    private readonly versoes: FaqVersaoRepository,
  ) {}

  async listar(ativo?: boolean) {
    const itens = await this.repo.listar(ativo);
    return { itens: itens.map(projetar) };
  }

  /** Catálogo de itens ativos, para uso do atendente/IA (FR-003). */
  async catalogo() {
    const itens = await this.repo.listarAtivos();
    return { itens: itens.map((f) => ({ id: f.id, pergunta: f.pergunta, resposta: f.resposta })) };
  }

  async obter(id: string) {
    const f = await this.repo.porId(id);
    if (!f) throw new NotFoundException('item de FAQ não encontrado');
    return projetar(f);
  }

  async listarVersoes(id: string) {
    const f = await this.repo.porId(id);
    if (!f) throw new NotFoundException('item de FAQ não encontrado');
    const itens = await this.versoes.listarPorItem(id);
    return {
      itens: itens.map((v) => ({
        id: v.id,
        pergunta: v.pergunta,
        resposta: v.resposta,
        autor: v.autor,
        criadoEm: v.criadoEm,
      })),
    };
  }

  async criar(dto: CriarFaqItemDto, autor: string) {
    const f = await this.repo.criar({ pergunta: dto.pergunta, resposta: dto.resposta });
    await this.versoes.criar({
      faqItemId: f.id,
      pergunta: f.pergunta,
      resposta: f.resposta,
      autor,
    });
    return projetar(f);
  }

  async atualizar(id: string, dto: AtualizarFaqItemDto, autor: string) {
    const antes = await this.repo.porId(id);
    if (!antes) throw new NotFoundException('item de FAQ não encontrado');

    const data: Prisma.FaqItemUncheckedUpdateInput = {};
    if (dto.pergunta !== undefined) data.pergunta = dto.pergunta;
    if (dto.resposta !== undefined) data.resposta = dto.resposta;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;

    const depois = Object.keys(data).length > 0 ? await this.repo.atualizar(id, data) : antes;

    const conteudoMudou = depois.pergunta !== antes.pergunta || depois.resposta !== antes.resposta;
    if (conteudoMudou) {
      await this.versoes.criar({
        faqItemId: id,
        pergunta: depois.pergunta,
        resposta: depois.resposta,
        autor,
      });
    }
    return projetar(depois);
  }
}
