import { Injectable, Logger } from '@nestjs/common';
import { projetarLead } from './lead-consulta.service';
import { LeadRepository } from '../../infra/lead/lead.repository';
import { TagService } from '../tag/tag.service';
import { LeadScoreService } from './lead-score.service';
import { CrmLeadAuditService } from './crm-lead-audit.service';
import {
  normalizarDocumento,
  normalizarEmail,
  normalizarNome,
  normalizarOrigem,
  normalizarTags,
  normalizarTelefone,
} from '../../domain/lead/normalizar-lead';
import type { ChaveOrigemLead, CriarLeadEntrada } from '../../domain/lead/tipos';

/**
 * Porta **in-process** para a spec 035 (coleta de leads de Marketing) injetar.
 * Idempotente por `(origem, id_externo)` — índice único parcial em `lead`.
 * Reentrada com a mesma chave devolve o lead existente (`criado: false`), sem
 * duplicar. **Sem endpoint HTTP** nesta spec.
 */
@Injectable()
export class RegistrarLeadService {
  private readonly logger = new Logger(RegistrarLeadService.name);

  constructor(
    private readonly repo: LeadRepository,
    private readonly score: LeadScoreService,
    private readonly audit: CrmLeadAuditService,
    private readonly tags: TagService,
  ) {}

  async registrar(
    entrada: CriarLeadEntrada,
    chave: ChaveOrigemLead,
  ): Promise<{ leadId: string; criado: boolean; lead: ReturnType<typeof projetarLead> }> {
    const existente = await this.repo.porOrigemExterna(chave.origem, chave.idExterno);
    if (existente) {
      return { leadId: existente.id, criado: false, lead: projetarLead(existente) };
    }

    const nome = normalizarNome(entrada.nome ?? '');
    if (nome.erro !== undefined) throw new Error(`nome inválido: ${nome.erro}`);
    const email =
      entrada.email && `${entrada.email}`.trim() !== ''
        ? normalizarEmail(entrada.email).valor ?? null
        : null;
    const telefone =
      entrada.telefone && `${entrada.telefone}`.trim() !== ''
        ? normalizarTelefone(entrada.telefone).valor ?? null
        : null;
    const documento =
      entrada.documento && `${entrada.documento}`.trim() !== ''
        ? normalizarDocumento(entrada.documento).valor ?? null
        : null;
    const tags = normalizarTags(entrada.tags).valor ?? [];

    const lead = await this.repo.criar({
      nome: nome.valor,
      email,
      telefone,
      documento,
      origem: normalizarOrigem(entrada.origem ?? chave.origem),
      idExterno: chave.idExterno,
      utmSource: entrada.utmSource ?? null,
      utmMedium: entrada.utmMedium ?? null,
      utmCampaign: entrada.utmCampaign ?? null,
      utmTerm: entrada.utmTerm ?? null,
      utmContent: entrada.utmContent ?? null,
      estagio: entrada.estagio ?? 'NOVO',
      responsavelId: entrada.responsavelId ?? null,
    });
    // spec 009 (CL-04): tags iniciais viram `tag_associacao` — sem auditoria
    // própria (embutidas no "criado" abaixo, mesmo padrão do LeadService.criar).
    for (const t of tags) {
      await this.tags.resolverEAssociarSemAuditoria({ tipo: 'lead', id: lead.id }, t, null);
    }
    const atual = (await this.repo.porId(lead.id)) ?? lead;
    await this.score.recalcular(atual, chave.origem);
    await this.audit.registrar({
      autor: chave.origem,
      entidade: 'lead',
      entidadeId: lead.id,
      campo: 'criado',
      valorAnterior: null,
      valorNovo: { origem: lead.origem, idExterno: lead.idExterno, nome: lead.nome, tags },
      motivo: 'registrar_integracao',
    });
    this.logger.log(`lead.registrado origem=${chave.origem} id_externo=${chave.idExterno}`);
    const final = (await this.repo.porId(lead.id)) ?? atual;
    return { leadId: lead.id, criado: true, lead: projetarLead(final) };
  }
}
