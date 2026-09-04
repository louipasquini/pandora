import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import {
  normalizarDocumento,
  normalizarEmail,
  normalizarNome,
  normalizarOrigem,
  normalizarTags,
  normalizarTelefone,
} from '../../domain/lead/normalizar-lead';
import type { CriarLeadEntrada } from '../../domain/lead/tipos';
import { LeadRepository, type LeadRow } from '../../infra/lead/lead.repository';
import { TagService } from '../tag/tag.service';
import { CrmLeadAuditService } from './crm-lead-audit.service';
import { LeadConsultaService, projetarLead } from './lead-consulta.service';
import { LeadScoreService } from './lead-score.service';
import type { AtualizarLeadDto } from '../../dto/atualizar-lead.schema';

type CamposNormalizados = {
  nome: string;
  email: string | null;
  telefone: string | null;
  documento: string | null;
  origem: string | null;
};

function normalizarContato(
  e: {
    nome?: string | null;
    email?: string | null;
    telefone?: string | null;
    documento?: string | null;
    origem?: string | null;
  },
  parcial = false,
): CamposNormalizados {
  const out: Partial<CamposNormalizados> = {};

  if (!parcial || e.nome !== undefined) {
    const r = normalizarNome(e.nome ?? '');
    if (r.erro !== undefined) throw new UnprocessableEntityException(`nome: ${r.erro}`);
    out.nome = r.valor;
  }
  if (!parcial || e.email !== undefined) {
    if (e.email == null || `${e.email}`.trim() === '') out.email = null;
    else {
      const r = normalizarEmail(e.email);
      if (r.erro !== undefined) throw new UnprocessableEntityException(`email: ${r.erro}`);
      out.email = r.valor;
    }
  }
  if (!parcial || e.telefone !== undefined) {
    if (e.telefone == null || `${e.telefone}`.trim() === '') out.telefone = null;
    else {
      const r = normalizarTelefone(e.telefone);
      if (r.erro !== undefined) throw new UnprocessableEntityException(`telefone: ${r.erro}`);
      out.telefone = r.valor;
    }
  }
  if (!parcial || e.documento !== undefined) {
    if (e.documento == null || `${e.documento}`.trim() === '') out.documento = null;
    else {
      const r = normalizarDocumento(e.documento);
      if (r.erro !== undefined)
        throw new UnprocessableEntityException(`documento: ${r.erro}`);
      out.documento = r.valor;
    }
  }
  if (!parcial || e.origem !== undefined) {
    out.origem = normalizarOrigem(e.origem ?? null);
  }
  return out as CamposNormalizados;
}

/**
 * CRUD de `lead` (spec 008, US1). Cada escrita recalcula o `score` (US3) e grava
 * **1** `crm_lead_audit` com delta real (no-op → 0). `score`/`pessoaId` são de
 * sistema — o schema zod já os rejeita; o serviço nunca os aceita.
 */
@Injectable()
export class LeadService {
  constructor(
    private readonly repo: LeadRepository,
    private readonly audit: CrmLeadAuditService,
    private readonly score: LeadScoreService,
    private readonly consulta: LeadConsultaService,
    private readonly tags: TagService,
  ) {}

  async criar(entrada: CriarLeadEntrada & { idExterno?: string | null }, autor: string) {
    const n = normalizarContato(entrada);
    if (!n.email && !n.telefone) {
      throw new UnprocessableEntityException('informe ao menos um contato: email ou telefone');
    }
    if (entrada.responsavelId && !(await this.repo.usuarioExiste(entrada.responsavelId))) {
      throw new UnprocessableEntityException('responsável (usuário) não encontrado');
    }
    const tagsR = normalizarTags(entrada.tags);
    if (tagsR.erro !== undefined) throw new UnprocessableEntityException(`tags: ${tagsR.erro}`);

    let lead = await this.repo.criar({
      nome: n.nome,
      email: n.email,
      telefone: n.telefone,
      documento: n.documento,
      origem: n.origem,
      idExterno: entrada.idExterno ?? null,
      utmSource: entrada.utmSource ?? null,
      utmMedium: entrada.utmMedium ?? null,
      utmCampaign: entrada.utmCampaign ?? null,
      utmTerm: entrada.utmTerm ?? null,
      utmContent: entrada.utmContent ?? null,
      estagio: entrada.estagio ?? 'NOVO',
      responsavelId: entrada.responsavelId ?? null,
    });
    // spec 009 (CL-04): tags iniciais viram `tag_associacao` — sem auditoria própria
    // aqui, para manter **1** registro de auditoria de "criado" (com o delta
    // completo, tags incluídas), como no contrato original da spec 008.
    for (const t of tagsR.valor) {
      await this.tags.resolverEAssociarSemAuditoria({ tipo: 'lead', id: lead.id }, t, null);
    }
    if (tagsR.valor.length > 0) {
      lead = (await this.repo.porId(lead.id)) ?? lead;
    }
    const scoreFinal = await this.score.recalcular(lead, autor);
    const semelhantes = await this.repo.semelhantesAtivos(n.email, n.telefone, lead.id);

    await this.audit.registrar({
      autor,
      entidade: 'lead',
      entidadeId: lead.id,
      campo: 'criado',
      valorAnterior: null,
      valorNovo: {
        nome: lead.nome,
        email: lead.email,
        telefone: lead.telefone,
        documento: lead.documento,
        origem: lead.origem,
        estagio: lead.estagio,
        responsavelId: lead.responsavelId,
        tags: lead.tagAssociacoes.map((a) => a.tag.slug),
      },
      motivo: 'criar',
    });

    return { ...projetarLead({ ...lead, score: scoreFinal }), leadsSemelhantes: semelhantes };
  }

  async atualizar(id: string, dto: AtualizarLeadDto, autor: string, req: Request) {
    const antes = await this.consulta.exigirNoEscopo(id, req);
    if (antes.status === 'CONVERTIDO') {
      throw new ConflictException('lead convertido é terminal');
    }

    const contatoKeys = ['nome', 'email', 'telefone', 'documento', 'origem'] as const;
    const tocaContato = contatoKeys.some((k) => k in dto);
    const n = tocaContato ? normalizarContato(dto, true) : null;

    const proxEmail = n && 'email' in dto ? n.email : antes.email;
    const proxTel = n && 'telefone' in dto ? n.telefone : antes.telefone;
    if (!proxEmail && !proxTel) {
      throw new UnprocessableEntityException('lead precisa de ao menos um contato');
    }
    if (
      dto.responsavelId &&
      !(await this.repo.usuarioExiste(dto.responsavelId))
    ) {
      throw new UnprocessableEntityException('responsável (usuário) não encontrado');
    }

    const data: Prisma.LeadUncheckedUpdateInput = {};
    if (n && 'nome' in dto) data.nome = n.nome;
    if (n && 'email' in dto) data.email = n.email;
    if (n && 'telefone' in dto) data.telefone = n.telefone;
    if (n && 'documento' in dto) data.documento = n.documento;
    if (n && 'origem' in dto) data.origem = n.origem;
    if ('utmSource' in dto) data.utmSource = dto.utmSource ?? null;
    if ('utmMedium' in dto) data.utmMedium = dto.utmMedium ?? null;
    if ('utmCampaign' in dto) data.utmCampaign = dto.utmCampaign ?? null;
    if ('utmTerm' in dto) data.utmTerm = dto.utmTerm ?? null;
    if ('utmContent' in dto) data.utmContent = dto.utmContent ?? null;
    if (dto.estagio !== undefined) data.estagio = dto.estagio;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.responsavelId !== undefined) data.responsavelId = dto.responsavelId ?? null;

    let atualizado: LeadRow = antes;
    if (Object.keys(data).length > 0) {
      atualizado = await this.repo.atualizar(id, data);
    }

    const motivo = motivoDoPatch(dto);
    const gravou = await this.audit.registrar({
      autor,
      entidade: 'lead',
      entidadeId: id,
      campo: motivo === 'editar' ? 'lead' : motivo,
      valorAnterior: snapshot(antes),
      valorNovo: snapshot(atualizado),
      motivo,
    });

    // recálculo derivado só quando um insumo mudou (contato/estágio/tags)
    if (gravou && (tocaContato || dto.estagio !== undefined)) {
      const scoreNovo = await this.score.recalcular(atualizado, autor);
      atualizado = { ...atualizado, score: scoreNovo };
    }
    return projetarLead(atualizado);
  }

  /**
   * spec 009 (CL-04): delega ao `TagService` compartilhado (lead\|pessoa\|
   * interacao) — mesmo contrato HTTP/auditoria (`crm_lead_audit`) da spec 008.
   */
  async addTag(id: string, tagBruta: string, autor: string, req: Request) {
    const lead = await this.consulta.exigirNoEscopo(id, req);
    const tinhaTags = lead.tagAssociacoes.length > 0;
    const r = await this.tags.associar({ tipo: 'lead', id }, tagBruta, null, autor);
    if (!r.associada) return projetarLead(lead);

    let atualizado = (await this.repo.porId(id)) ?? lead;
    if (!tinhaTags) {
      const s = await this.score.recalcular(atualizado, autor);
      atualizado = { ...atualizado, score: s };
    }
    return projetarLead(atualizado);
  }

  async removerTag(id: string, tagBruta: string, autor: string, req: Request) {
    const lead = await this.consulta.exigirNoEscopo(id, req);
    const r = await this.tags.desassociar({ tipo: 'lead', id }, tagBruta, autor);
    if (!r.removida) return projetarLead(lead);

    let atualizado = (await this.repo.porId(id)) ?? lead;
    if (r.tags.length === 0) {
      const s = await this.score.recalcular(atualizado, autor);
      atualizado = { ...atualizado, score: s };
    }
    return projetarLead(atualizado);
  }

  guardaContraDelete(): never {
    throw new BadRequestException('lead não é apagado — use status = DESCARTADO');
  }
}

function snapshot(l: LeadRow) {
  return {
    nome: l.nome,
    email: l.email,
    telefone: l.telefone,
    documento: l.documento,
    origem: l.origem,
    estagio: l.estagio,
    status: l.status,
    responsavelId: l.responsavelId,
    utm: {
      source: l.utmSource,
      medium: l.utmMedium,
      campaign: l.utmCampaign,
      term: l.utmTerm,
      content: l.utmContent,
    },
  };
}

function motivoDoPatch(dto: AtualizarLeadDto): 'editar' | 'estagio' | 'status' | 'responsavel' {
  const keys = Object.keys(dto);
  if (keys.length === 1) {
    if (keys[0] === 'estagio') return 'estagio';
    if (keys[0] === 'status') return 'status';
    if (keys[0] === 'responsavelId') return 'responsavel';
  }
  return 'editar';
}
