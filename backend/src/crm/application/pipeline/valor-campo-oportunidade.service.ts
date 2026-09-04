import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { Request } from 'express';
import { validarValorCampo } from '../../domain/lead/validar-valor-campo';
import { CampoOportunidadeRepository } from '../../infra/pipeline/campo-oportunidade.repository';
import { ValorCampoOportunidadeRepository } from '../../infra/pipeline/valor-campo-oportunidade.repository';
import { CrmPipelineAuditService } from './crm-pipeline-audit.service';
import { OportunidadeConsultaService } from './oportunidade-consulta.service';
import type { ValoresCamposOportunidadeDto } from '../../dto/campo-oportunidade.schema';

/**
 * Valores de campos personalizados por oportunidade (spec 010, US6). `PUT` =
 * **substituição total**: o corpo é o conjunto final; chave ausente/`null`
 * remove. Mesmo padrão de `ValorCampoService` (008/lead).
 */
@Injectable()
export class ValorCampoOportunidadeService {
  constructor(
    private readonly defs: CampoOportunidadeRepository,
    private readonly valores: ValorCampoOportunidadeRepository,
    private readonly audit: CrmPipelineAuditService,
    private readonly consulta: OportunidadeConsultaService,
  ) {}

  async obter(oportunidadeId: string, req: Request): Promise<Record<string, string>> {
    await this.consulta.exigirNoEscopo(oportunidadeId, req);
    const rows = await this.valores.porOportunidade(oportunidadeId);
    return Object.fromEntries(rows.map((r) => [r.definicao.chave, r.valor]));
  }

  async substituir(
    oportunidadeId: string,
    corpo: ValoresCamposOportunidadeDto,
    autor: string,
    req: Request,
  ): Promise<Record<string, string>> {
    await this.consulta.exigirNoEscopo(oportunidadeId, req);
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
    for (const d of definicoes) {
      if (!(d.chave in corpo)) remover.push({ definicaoId: d.id, chave: d.chave });
    }

    const antes = Object.fromEntries(
      (await this.valores.porOportunidade(oportunidadeId)).map((r) => [
        r.definicao.chave,
        r.valor,
      ]),
    );

    await this.valores.aplicar(
      oportunidadeId,
      upserts.map((u) => ({ definicaoId: u.definicaoId, valor: u.valor })),
      [...new Set(remover.map((r) => r.definicaoId))],
    );

    const depois = await this.obter(oportunidadeId, req);

    const chaves = new Set([...Object.keys(antes), ...Object.keys(depois)]);
    for (const c of chaves) {
      if (antes[c] !== depois[c]) {
        await this.audit.registrar({
          autor,
          entidade: 'valor_campo_oportunidade',
          entidadeId: oportunidadeId,
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
