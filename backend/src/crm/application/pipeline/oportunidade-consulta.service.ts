import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import type { AuthContext } from '../../../auth/guards/jwt-auth.guard';
import { SujeitoRbacService } from '../../../auth/rbac/sujeito-rbac.service';
import { OportunidadeRepository, type OportunidadeRow } from '../../infra/pipeline/oportunidade.repository';
import { LeadConsultaService } from '../lead/lead-consulta.service';
import { projetarOportunidade } from './projetar-oportunidade';
import type { ListarOportunidadesDto } from '../../dto/oportunidade.schema';

function sub(req: Request): string | undefined {
  return (req as Request & { auth?: AuthContext }).auth?.sub;
}

/**
 * Escopo de visão de `oportunidade` (spec 010, US3) — mesmo padrão "OU" +
 * filtro no `where` já usado por `LeadConsultaService` (008). Enriquece cada
 * linha com `slaEstourado`/`esfriando` (derivados — FR-017/FR-018), buscando
 * a última `interacao` da âncora em lote (evita N+1).
 */
@Injectable()
export class OportunidadeConsultaService {
  constructor(
    private readonly repo: OportunidadeRepository,
    private readonly leadConsulta: LeadConsultaService,
    private readonly rbac: SujeitoRbacService,
  ) {}

  async escopoDe(req: Request): Promise<Prisma.OportunidadeWhereInput> {
    const perms = await this.rbac.permissoesDe(req);
    if (perms.has('oportunidade:ver_todas')) return {};
    if (perms.has('oportunidade:ver_proprias')) {
      return { responsavelId: sub(req) ?? '__sem_sujeito__' };
    }
    throw new ForbiddenException('permissão insuficiente');
  }

  private async enriquecer(itens: OportunidadeRow[]) {
    const pessoaIds = [...new Set(itens.filter((o) => o.pessoaId).map((o) => o.pessoaId as string))];
    const leadIds = [...new Set(itens.filter((o) => o.leadId).map((o) => o.leadId as string))];
    const [porPessoa, porLead] = await Promise.all([
      this.repo.ultimaInteracaoPorPessoas(pessoaIds),
      this.repo.ultimaInteracaoPorLeads(leadIds),
    ]);
    return itens.map((o) => {
      const ultimaReferencia = o.pessoaId
        ? porPessoa.get(o.pessoaId)
        : o.leadId
          ? porLead.get(o.leadId)
          : undefined;
      return projetarOportunidade(o, { ultimaReferencia });
    });
  }

  async listar(dto: ListarOportunidadesDto, req: Request) {
    const escopo = await this.escopoDe(req);
    const and: Prisma.OportunidadeWhereInput[] = [escopo];
    if (dto.pipelineId) and.push({ pipelineId: dto.pipelineId });
    if (dto.etapaId) and.push({ etapaId: dto.etapaId });
    if (dto.responsavelId) and.push({ responsavelId: dto.responsavelId });

    const { itens, total } = await this.repo.listar(
      { AND: and },
      { pagina: dto.pagina, tamanho: dto.tamanho },
    );
    let projetados = await this.enriquecer(itens);
    if (dto.slaEstourado !== undefined) {
      projetados = projetados.filter((o) => o.slaEstourado === dto.slaEstourado);
    }
    if (dto.esfriando !== undefined) {
      projetados = projetados.filter((o) => o.esfriando === dto.esfriando);
    }
    return { itens: projetados, pagina: dto.pagina, tamanho: dto.tamanho, total };
  }

  async obter(id: string, req: Request) {
    const escopo = await this.escopoDe(req);
    const row = await this.repo.listar({ AND: [escopo, { id }] }, { pagina: 1, tamanho: 1 });
    if (row.itens.length === 0) throw new NotFoundException('oportunidade não encontrada');
    const [projetado] = await this.enriquecer(row.itens);
    return projetado;
  }

  /** Usado pelos serviços de escrita: garante que o sujeito enxerga a oportunidade. */
  async exigirNoEscopo(id: string, req: Request): Promise<OportunidadeRow> {
    const escopo = await this.escopoDe(req);
    const row = await this.repo.listar({ AND: [escopo, { id }] }, { pagina: 1, tamanho: 1 });
    if (row.itens.length === 0) throw new NotFoundException('oportunidade não encontrada');
    return row.itens[0];
  }

  async listarPorPessoa(pessoaId: string, req: Request) {
    const perms = await this.rbac.permissoesDe(req);
    if (!perms.has('pessoa:ver')) throw new ForbiddenException('permissão insuficiente');
    if (!(await this.repo.pessoaExiste(pessoaId))) {
      throw new NotFoundException('pessoa não encontrada');
    }
    const itens = await this.repo.listarPorPessoa(pessoaId);
    return { itens: await this.enriquecer(itens) };
  }

  async listarPorLead(leadId: string, req: Request) {
    await this.leadConsulta.exigirNoEscopo(leadId, req);
    const itens = await this.repo.listarPorLead(leadId);
    return { itens: await this.enriquecer(itens) };
  }
}
