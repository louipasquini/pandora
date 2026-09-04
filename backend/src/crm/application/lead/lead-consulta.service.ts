import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import type { AuthContext } from '../../../auth/guards/jwt-auth.guard';
import { SujeitoRbacService } from '../../../auth/rbac/sujeito-rbac.service';
import { LeadRepository, type LeadRow } from '../../infra/lead/lead.repository';
import { ValorCampoRepository } from '../../infra/lead/valor-campo.repository';
import type { ListarLeadsDto } from '../../dto/listar-leads.schema';

export function projetarLead(l: LeadRow, campos?: Record<string, string>) {
  return {
    id: l.id,
    nome: l.nome,
    email: l.email,
    telefone: l.telefone,
    documento: l.documento,
    origem: l.origem,
    idExterno: l.idExterno,
    utm: {
      source: l.utmSource,
      medium: l.utmMedium,
      campaign: l.utmCampaign,
      term: l.utmTerm,
      content: l.utmContent,
    },
    estagio: l.estagio,
    status: l.status,
    responsavelId: l.responsavelId,
    // spec 009 (CL-04): `tags` é projetada de `tag_associacao`/`tag`, não mais
    // uma coluna própria — `LeadRepository` sempre inclui `tagAssociacoes.tag`.
    tags: l.tagAssociacoes.map((a) => a.tag.slug),
    score: l.score,
    scoreAtualizadoEm: l.scoreAtualizadoEm,
    pessoaId: l.pessoaId,
    convertidoEm: l.convertidoEm,
    criadoEm: l.criadoEm,
    atualizadoEm: l.atualizadoEm,
    ...(campos ? { campos } : {}),
  };
}

function sub(req: Request): string | undefined {
  return (req as Request & { auth?: AuthContext }).auth?.sub;
}

/**
 * Escopo de visão do Lead (spec 008, US2). As rotas de leitura são
 * `@AutenticadoBasta()`; este serviço faz **o gate "OU"** (`lead:ver_todos` |
 * `lead:ver_proprios`) e monta o `where` de escopo **na query** — filtros do
 * query-string entram com `AND` e nunca ampliam (research §5).
 */
@Injectable()
export class LeadConsultaService {
  constructor(
    private readonly repo: LeadRepository,
    private readonly valores: ValorCampoRepository,
    private readonly rbac: SujeitoRbacService,
  ) {}

  /** Lança 403 se o sujeito não pode ver lead nenhum. */
  async escopoDe(req: Request): Promise<Prisma.LeadWhereInput> {
    const perms = await this.rbac.permissoesDe(req);
    if (perms.has('lead:ver_todos')) return {};
    if (perms.has('lead:ver_proprios')) {
      return { responsavelId: sub(req) ?? '__sem_sujeito__' };
    }
    throw new ForbiddenException('permissão insuficiente');
  }

  async listar(dto: ListarLeadsDto, camposFiltro: Record<string, string>, req: Request) {
    const escopo = await this.escopoDe(req);
    const and: Prisma.LeadWhereInput[] = [escopo];

    if (dto.estagio) and.push({ estagio: dto.estagio });
    and.push({ status: dto.status ?? { not: 'CONVERTIDO' } });
    if (dto.origem) and.push({ origem: dto.origem });
    if (dto.responsavelId) and.push({ responsavelId: dto.responsavelId });
    if (dto.semResponsavel === true) and.push({ responsavelId: null });
    if (dto.q) {
      const q = dto.q;
      and.push({
        OR: [
          { nome: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { telefone: { contains: q } },
        ],
      });
    }
    for (const [chave, valor] of Object.entries(camposFiltro)) {
      const ids = await this.valores.leadIdsComCampo(chave, valor);
      and.push({ id: { in: ids.length ? ids : ['__nenhum__'] } });
    }

    const { itens, total } = await this.repo.listar(
      { AND: and },
      { pagina: dto.pagina, tamanho: dto.tamanho, ordenarPor: dto.ordenarPor },
    );
    return {
      itens: itens.map((l) => projetarLead(l)),
      pagina: dto.pagina,
      tamanho: dto.tamanho,
      total,
    };
  }

  async obter(id: string, req: Request) {
    const escopo = await this.escopoDe(req);
    const lead = await this.repo.obterNoEscopo(id, escopo);
    if (!lead) throw new NotFoundException('lead não encontrado');
    const valores = await this.valores.porLead(id);
    const campos = Object.fromEntries(
      valores.map((v) => [v.definicao.chave, v.valor]),
    );
    return projetarLead(lead, campos);
  }

  /** Usado pelos serviços de escrita: garante que o sujeito enxerga o lead (404 senão). */
  async exigirNoEscopo(id: string, req: Request): Promise<LeadRow> {
    const escopo = await this.escopoDe(req);
    const lead = await this.repo.obterNoEscopo(id, escopo);
    if (!lead) throw new NotFoundException('lead não encontrado');
    return lead;
  }
}
