import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { Request } from 'express';
import { validarValorCampo } from '../../domain/lead/validar-valor-campo';
import { CampoPersonalizadoRepository } from '../../infra/lead/campo-personalizado.repository';
import { ValorCampoRepository } from '../../infra/lead/valor-campo.repository';
import { CrmLeadAuditService } from './crm-lead-audit.service';
import { LeadConsultaService } from './lead-consulta.service';
import type { ValoresCamposDto } from '../../dto/campo-personalizado.schema';

/**
 * Valores de campos personalizados por lead (spec 008, US5). `PUT` =
 * **substituição total**: o corpo é o conjunto final; chave ausente/`null`
 * remove. Valida cada valor contra a definição ativa (chave desconhecida → 422;
 * tipo incompatível → 422; `obrigatorio` ausente → 422). Delta por chave em
 * `crm_lead_audit`.
 */
@Injectable()
export class ValorCampoService {
  constructor(
    private readonly defs: CampoPersonalizadoRepository,
    private readonly valores: ValorCampoRepository,
    private readonly audit: CrmLeadAuditService,
    private readonly consulta: LeadConsultaService,
  ) {}

  async obter(leadId: string, req: Request): Promise<Record<string, string>> {
    await this.consulta.exigirNoEscopo(leadId, req);
    const rows = await this.valores.porLead(leadId);
    return Object.fromEntries(rows.map((r) => [r.definicao.chave, r.valor]));
  }

  async substituir(
    leadId: string,
    corpo: ValoresCamposDto,
    autor: string,
    req: Request,
  ): Promise<Record<string, string>> {
    await this.consulta.exigirNoEscopo(leadId, req);
    const definicoes = await this.defs.listarAtivas();
    const porChave = new Map(definicoes.map((d) => [d.chave, d]));

    const chavesCorpo = Object.keys(corpo);
    for (const chave of chavesCorpo) {
      if (!porChave.has(chave)) {
        throw new UnprocessableEntityException({ erro: 'campo_desconhecido', chave });
      }
    }
    for (const d of definicoes) {
      if (d.obrigatorio) {
        const v = corpo[d.chave];
        if (v === undefined || v === null || `${v}`.trim() === '') {
          throw new UnprocessableEntityException({ erro: 'campo_obrigatorio', chave: d.chave });
        }
      }
    }

    const upserts: { definicaoId: string; valor: string; chave: string }[] = [];
    const remover: { definicaoId: string; chave: string }[] = [];
    for (const chave of chavesCorpo) {
      const d = porChave.get(chave)!;
      const r = validarValorCampo(d.tipo, d.opcoes, corpo[chave]);
      if (!r.ok) {
        throw new UnprocessableEntityException({ erro: 'valor_invalido', chave, tipo: d.tipo });
      }
      if ('remover' in r) remover.push({ definicaoId: d.id, chave });
      else upserts.push({ definicaoId: d.id, valor: r.valor, chave });
    }
    // chaves de definições ativas ausentes do corpo → remover (substituição total)
    for (const d of definicoes) {
      if (!(d.chave in corpo)) remover.push({ definicaoId: d.id, chave: d.chave });
    }

    const antes = Object.fromEntries(
      (await this.valores.porLead(leadId)).map((r) => [r.definicao.chave, r.valor]),
    );

    await this.valores.aplicar(
      leadId,
      upserts.map((u) => ({ definicaoId: u.definicaoId, valor: u.valor })),
      [...new Set(remover.map((r) => r.definicaoId))],
    );

    const depois = await this.obter(leadId, req);

    // delta por chave
    const chaves = new Set([...Object.keys(antes), ...Object.keys(depois)]);
    for (const c of chaves) {
      if (antes[c] !== depois[c]) {
        await this.audit.registrar({
          autor,
          entidade: 'valor_campo_lead',
          entidadeId: leadId,
          campo: `campos.${c}`,
          valorAnterior: antes[c] ?? null,
          valorNovo: depois[c] ?? null,
          motivo: 'campos_personalizados',
        });
      }
    }
    return depois;
  }
}
