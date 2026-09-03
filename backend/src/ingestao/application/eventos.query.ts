import { Injectable, NotFoundException } from '@nestjs/common';
import { ETAPA_POR_NOME } from '../domain';
import { EventoRepository, type ListaFiltros } from '../infra/evento.repository';
import type { ListarEventosDto } from '../dto/listar-eventos.schema';

/** Leitura do painel de eventos (spec 006). Só compõe — não escreve. */
@Injectable()
export class EventosQuery {
  constructor(private readonly repo: EventoRepository) {}

  async listar(q: ListarEventosDto) {
    const filtros: ListaFiltros = {
      status: q.status,
      plataformaOrigem: q.plataformaOrigem,
      tipoOrigem: q.tipoOrigem,
      classificacao: q.classificacao,
      recebidoDe: q.recebidoDe,
      recebidoAte: q.recebidoAte,
      pagina: q.pagina,
      tamanho: q.tamanho,
    };
    const { itens, total } = await this.repo.listar(filtros);
    return { itens, pagina: q.pagina, tamanho: q.tamanho, total };
  }

  async detalhe(id: string) {
    const e = await this.repo.detalhe(id);
    if (!e) throw new NotFoundException('evento não encontrado');
    const etapas = [...e.etapas].sort(
      (a, b) =>
        (ETAPA_POR_NOME.get(a.etapa)?.ordem ?? 99) -
        (ETAPA_POR_NOME.get(b.etapa)?.ordem ?? 99),
    );
    return { ...e, etapas };
  }
}
