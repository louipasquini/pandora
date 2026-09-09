import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { validarValorCampo } from '../domain/validar-valor-campo';
import { CampoPersonalizadoPessoaRepository } from '../infra/campo-personalizado-pessoa.repository';
import { ValorCampoPessoaRepository } from '../infra/valor-campo-pessoa.repository';
import { ClientesAuditService } from './clientes-audit.service';
import type { ValoresCamposPessoaDto } from '../dto/campo-personalizado-pessoa.schema';

/**
 * Valores de campos personalizados por `pessoa` (spec 013, CL-02). Espelha
 * `crm/application/lead/valor-campo.service.ts` (spec 008). `substituir` =
 * **substituição total** (mesmo contrato do `PUT` de lead). `definirValor`
 * grava **1** valor sem tocar nos demais — é o método consumido pela porta
 * `PortaCampoPersonalizadoPessoa` (o `crm` aceitando uma sugestão de IA,
 * research.md D-R3), e nunca é exposto por rota HTTP própria.
 */
@Injectable()
export class ValorCampoPessoaService {
  constructor(
    private readonly defs: CampoPersonalizadoPessoaRepository,
    private readonly valores: ValorCampoPessoaRepository,
    private readonly audit: ClientesAuditService,
  ) {}

  private async exigirPessoa(pessoaId: string): Promise<void> {
    if (!(await this.valores.pessoaExiste(pessoaId))) {
      throw new NotFoundException('pessoa não encontrada');
    }
  }

  async obter(pessoaId: string): Promise<Record<string, string>> {
    await this.exigirPessoa(pessoaId);
    const rows = await this.valores.porPessoa(pessoaId);
    return Object.fromEntries(rows.map((r) => [r.definicao.chave, r.valor]));
  }

  async substituir(
    pessoaId: string,
    corpo: ValoresCamposPessoaDto,
    autor: string,
  ): Promise<Record<string, string>> {
    await this.exigirPessoa(pessoaId);
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
      (await this.valores.porPessoa(pessoaId)).map((r) => [r.definicao.chave, r.valor]),
    );

    await this.valores.aplicar(
      pessoaId,
      upserts.map((u) => ({ definicaoId: u.definicaoId, valor: u.valor })),
      [...new Set(remover.map((r) => r.definicaoId))],
    );

    const depois = await this.obter(pessoaId);

    const chaves = new Set([...Object.keys(antes), ...Object.keys(depois)]);
    for (const c of chaves) {
      if (antes[c] !== depois[c]) {
        await this.audit.registrar({
          autor,
          entidade: 'valor_campo_pessoa',
          entidadeId: pessoaId,
          campo: `campos.${c}`,
          valorAnterior: antes[c] ?? null,
          valorNovo: depois[c] ?? null,
          motivo: 'campos_personalizados',
        });
      }
    }
    return depois;
  }

  /** Grava **1** valor sem tocar nos demais — porta (research.md D-R3). */
  async definirValor(
    pessoaId: string,
    definicaoId: string,
    valorBruto: unknown,
    autor: string,
  ): Promise<void> {
    await this.exigirPessoa(pessoaId);
    const def = await this.defs.porId(definicaoId);
    if (!def || !def.ativo) {
      throw new UnprocessableEntityException({ erro: 'campo_desconhecido_ou_inativo' });
    }
    const r = validarValorCampo(def.tipo, def.opcoes, valorBruto);
    if (!r.ok) {
      throw new UnprocessableEntityException({ erro: 'valor_invalido', chave: def.chave });
    }

    const antes =
      (await this.valores.porPessoa(pessoaId)).find((v) => v.definicaoId === definicaoId)
        ?.valor ?? null;

    if ('remover' in r) {
      await this.valores.aplicar(pessoaId, [], [definicaoId]);
    } else {
      await this.valores.aplicar(pessoaId, [{ definicaoId, valor: r.valor }], []);
    }

    const depois = 'remover' in r ? null : r.valor;
    if (antes !== depois) {
      await this.audit.registrar({
        autor,
        entidade: 'valor_campo_pessoa',
        entidadeId: pessoaId,
        campo: `campos.${def.chave}`,
        valorAnterior: antes,
        valorNovo: depois,
        motivo: 'sugestao_ia_aceita',
      });
    }
  }
}
