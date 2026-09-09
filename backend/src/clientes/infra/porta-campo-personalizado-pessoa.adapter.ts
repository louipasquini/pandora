import { Injectable } from '@nestjs/common';
import type {
  DefinicaoCampoPersonalizadoPessoa,
  PortaCampoPersonalizadoPessoa,
} from '../../core/core.module';
import { CampoPersonalizadoPessoaService } from '../application/campo-personalizado-pessoa.service';
import { ValorCampoPessoaService } from '../application/valor-campo-pessoa.service';

/**
 * Adaptador da spec 013 — implementa `PortaCampoPersonalizadoPessoa` do
 * `core` delegando aos serviços de `clientes`. É o que permite o `crm`
 * (aceitar sugestão de campo personalizado) consumir sem importar
 * `src/clientes/**` (Princípio VI). Mesmo padrão de `PortaIdentidadeAdapter`
 * (spec 008).
 */
@Injectable()
export class PortaCampoPersonalizadoPessoaAdapter implements PortaCampoPersonalizadoPessoa {
  constructor(
    private readonly defs: CampoPersonalizadoPessoaService,
    private readonly valores: ValorCampoPessoaService,
  ) {}

  async listarDefinicoesAtivas(): Promise<DefinicaoCampoPersonalizadoPessoa[]> {
    return this.defs.listarAtivas();
  }

  async definirValor(
    pessoaId: string,
    definicaoId: string,
    valor: string,
    autor: string,
  ): Promise<void> {
    await this.valores.definirValor(pessoaId, definicaoId, valor, autor);
  }
}
