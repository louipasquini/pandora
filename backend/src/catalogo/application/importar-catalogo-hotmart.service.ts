import { BadRequestException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import {
  leitorDeCampos,
  lerCsv,
  paraBooleano,
  parseDataCivil,
  SCHEMA_LANCAMENTOS_CSV,
  SCHEMA_OFERTAS_CSV,
  SCHEMA_PRODUTOS_CSV,
  validarSchemaColunas,
} from '../domain';
import { JanelaLancamentoRepository } from '../infra/janela-lancamento.repository';
import { OfertaRepository } from '../infra/oferta.repository';
import { ProdutoRepository } from '../infra/produto.repository';

export interface ResultadoImportCsv {
  processadas: number;
  criadas: number;
  atualizadas: number;
  ignoradas: number;
}

const FORMATO_CODIGO_PRODUTO = /^[A-Za-z]{3}$/;

function lerOuRejeitar(csv: string): { cabecalho: string[]; linhas: string[][] } {
  const lido = lerCsv(csv);
  if (!lido) throw new BadRequestException({ erro: 'csv_vazio' });
  return lido;
}

function validarOuRejeitar(
  cabecalho: readonly string[],
  schema: Parameters<typeof validarSchemaColunas>[1],
) {
  const r = validarSchemaColunas(cabecalho, schema);
  if (!r.ok) {
    throw new UnprocessableEntityException({
      erro: 'schema_invalido',
      colunasEsperadas: schema.map((c) => c.canonica),
      colunasFaltando: r.colunasFaltando,
    });
  }
  return r.indice;
}

/**
 * Import do catálogo Hotmart (spec 023, D-11/D-12) — `produtos.csv`,
 * `ofertas.csv`, `lancamentos.csv` (`afiliados.csv` é escopo da spec 026).
 * Schema de colunas validado **por completo** antes de processar qualquer
 * linha (Parte 7 #3 da visão) — arquivo inválido é rejeitado atômico.
 */
@Injectable()
export class ImportarCatalogoHotmartService {
  constructor(
    private readonly produtos: ProdutoRepository,
    private readonly ofertas: OfertaRepository,
    private readonly janelas: JanelaLancamentoRepository,
  ) {}

  async importarProdutos(csv: string): Promise<ResultadoImportCsv> {
    const lido = lerOuRejeitar(csv);
    const indice = validarOuRejeitar(lido.cabecalho, SCHEMA_PRODUTOS_CSV);

    let criadas = 0;
    let atualizadas = 0;
    let ignoradas = 0;

    for (const linha of lido.linhas) {
      const g = leitorDeCampos(linha, indice);
      const codigo = g('codigo');
      if (!codigo || !FORMATO_CODIGO_PRODUTO.test(codigo)) {
        ignoradas += 1;
        continue;
      }
      const { produto, criado } = await this.produtos.buscarOuCriarPorCodigo(codigo);
      if (criado) criadas += 1;
      else atualizadas += 1;

      await this.produtos.aplicarDerivado(produto.id, {
        nome: g('nome'),
        assinatura: paraBooleano(g('assinatura')),
      });
    }

    return { processadas: lido.linhas.length, criadas, atualizadas, ignoradas };
  }

  /** `conta` é `HOTMART_PRD`\|`HOTMART_SVC` — a mesma oferta pode ter `price_code` diferente por conta. */
  async importarOfertas(csv: string, conta: string): Promise<ResultadoImportCsv> {
    const lido = lerOuRejeitar(csv);
    const indice = validarOuRejeitar(lido.cabecalho, SCHEMA_OFERTAS_CSV);

    let criadas = 0;
    let atualizadas = 0;
    let ignoradas = 0;

    for (const linha of lido.linhas) {
      const g = leitorDeCampos(linha, indice);
      const priceCode = g('price_code');
      const produtoCodigo = g('produto_codigo');
      // FR-015/D-12: linha sem price_code é ignorada, não derruba o arquivo.
      if (!priceCode || !produtoCodigo || !FORMATO_CODIGO_PRODUTO.test(produtoCodigo)) {
        ignoradas += 1;
        continue;
      }

      const { produto } = await this.produtos.buscarOuCriarPorCodigo(produtoCodigo);
      const existente = await this.ofertas.buscarPorOrigemRef(
        conta,
        'HOTMART_PRICE_CODE',
        priceCode,
      );

      let ofertaId: string;
      if (existente) {
        ofertaId = existente.id;
        atualizadas += 1;
      } else {
        const { oferta } = await this.ofertas.criarComOrigemRef({
          produtoId: produto.id,
          plataformaOrigem: conta,
          tipoRef: 'HOTMART_PRICE_CODE',
          valorRef: priceCode,
        });
        ofertaId = oferta.id;
        criadas += 1;
      }

      const tag = g('tag');
      if (tag) {
        // informativo (D-C do contrato import-csv-hotmart.md) — nunca usado na
        // resolução em tempo de venda (Hotmart nunca resolve por tag, D-03).
        await this.ofertas.criarOrigemRefSeAusente(ofertaId, conta, 'TAG', tag.toUpperCase());
      }
    }

    return { processadas: lido.linhas.length, criadas, atualizadas, ignoradas };
  }

  async importarLancamentos(csv: string): Promise<ResultadoImportCsv> {
    const lido = lerOuRejeitar(csv);
    const indice = validarOuRejeitar(lido.cabecalho, SCHEMA_LANCAMENTOS_CSV);

    let criadas = 0;
    let atualizadas = 0;
    let ignoradas = 0;

    for (const linha of lido.linhas) {
      const g = leitorDeCampos(linha, indice);
      const produtoCodigo = g('produto_codigo');
      const rotulo = g('rotulo');
      const inicio = parseDataCivil(g('inicio'));
      const fim = parseDataCivil(g('fim'));

      if (!produtoCodigo || !rotulo || !inicio || !fim || inicio >= fim) {
        ignoradas += 1;
        continue;
      }
      const produto = await this.produtos.buscarPorCodigo(produtoCodigo);
      if (!produto) {
        // lançamento pressupõe produto já conhecido — nunca cria produto aqui.
        ignoradas += 1;
        continue;
      }

      const { criada } = await this.janelas.upsert({ produtoId: produto.id, rotulo, inicio, fim });
      if (criada) criadas += 1;
      else atualizadas += 1;
    }

    return { processadas: lido.linhas.length, criadas, atualizadas, ignoradas };
  }
}
