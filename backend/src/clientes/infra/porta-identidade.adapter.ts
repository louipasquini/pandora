import { Injectable } from '@nestjs/common';
import type {
  DadosIdentidadeLead,
  OpcoesPortaIdentidade,
  PortaIdentidade,
  ResultadoPortaIdentidade,
} from '../../core/core.module';
import { ResolverOuCriarService } from '../application/resolver-ou-criar.service';

/**
 * Adaptador da spec 008 — implementa a interface `PortaIdentidade` do `core`
 * delegando ao `ResolverOuCriarService` (spec 005). É o que permite o `crm`
 * (e a 018) consumirem a engine de identidade **sem importar `src/clientes/**`**
 * (a fronteira do Princípio VI). `ResolverOuCriarService` não muda.
 *
 * O mapeamento é quase 1:1 — `DadosIdentidadeLead` e `OpcoesPortaIdentidade`
 * têm a mesma forma que `DadosIdentidade` / `OpcoesResolver` da 005 (documento
 * bruto classificado por dígitos + DV pela própria engine).
 */
@Injectable()
export class PortaIdentidadeAdapter implements PortaIdentidade {
  constructor(private readonly resolver: ResolverOuCriarService) {}

  async resolverOuCriar(
    dados: DadosIdentidadeLead,
    opts: OpcoesPortaIdentidade,
  ): Promise<ResultadoPortaIdentidade> {
    const r = await this.resolver.resolverOuCriar(
      {
        nome: dados.nome ?? null,
        documento: dados.documento ?? null,
        email: dados.email ?? null,
        telefone: dados.telefone ?? null,
      },
      { criar: opts.criar, origem: opts.origem },
    );
    return { pessoaId: r.pessoaId, criada: r.criada };
  }
}
