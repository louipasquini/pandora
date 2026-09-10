import { Inject, Injectable } from '@nestjs/common';
import {
  PORTA_IDENTIDADE,
  type EntradaEtapaExterna,
  type ExecutorEtapaExterno,
  type PortaIdentidade,
  type SaidaEtapaExterna,
} from '../../core/core.module';
import { deveCriarPessoa } from '../domain';

/**
 * Etapa 2 do pipeline canônico (visão 5.3) — `RESOLVER_PESSOA`. Executor externo
 * (contrato do `core`) que o `WorkerService` chama sem conhecer o `financeiro`.
 *
 * Reusa a engine de identidade/dedup da spec 005 pela `PortaIdentidade` do `core`
 * — **nunca importa `src/clientes/**`**. `criar: false` sse `VENDA_AFILIADA`
 * (Regra Inviolável nº 8). `pessoaId = null` é resultado válido (`ok`).
 */
@Injectable()
export class ResolverPessoaEtapaService implements ExecutorEtapaExterno {
  readonly etapa = 'RESOLVER_PESSOA';

  constructor(
    @Inject(PORTA_IDENTIDADE) private readonly identidade: PortaIdentidade,
  ) {}

  async executar(entrada: EntradaEtapaExterna): Promise<SaidaEtapaExterna> {
    const classificacao =
      (entrada.resultados.CLASSIFICAR as { classificacao?: string } | undefined)
        ?.classificacao ?? 'DESCONHECIDO';
    const criar = deveCriarPessoa(classificacao);

    const comprador = entrada.canonico?.comprador;
    const dados = {
      nome: comprador?.nome ?? null,
      documento: comprador?.documentos?.[0] ?? null,
      email: comprador?.emails?.[0] ?? null,
      telefone: comprador?.telefones?.[0] ?? null,
    };

    const temChave = Boolean(dados.documento || dados.email || dados.telefone);
    const temNome = Boolean(dados.nome && dados.nome.trim());
    if (!temChave && !temNome) {
      // nada para resolver — não cria "(sem nome)" só porque a venda é própria
      return { status: 'ok', resultado: { pessoaId: null, criada: false } };
    }

    const r = await this.identidade.resolverOuCriar(dados, {
      criar,
      origem: {
        plataformaOrigem: entrada.plataformaOrigem,
        refs: [{ tipoRef: 'transacao', valorRef: entrada.idOrigem }],
      },
    });

    return {
      status: 'ok',
      resultado: { pessoaId: r.pessoaId, criada: r.criada },
    };
  }
}
