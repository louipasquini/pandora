import { Global, Module } from '@nestjs/common';
import { PORTA_IDENTIDADE, PORTA_CAMPO_PERSONALIZADO_PESSOA } from '../core/core.module';
import { ClientesModule } from './clientes.module';
import { PortaIdentidadeAdapter } from './infra/porta-identidade.adapter';
import { PortaCampoPersonalizadoPessoaAdapter } from './infra/porta-campo-personalizado-pessoa.adapter';

/**
 * Wiring de `clientes` — módulo **`@Global()`** que expõe os tokens de porta
 * do `core` implementados por adaptadores da spec 005/013. Por ser global,
 * ficam injetáveis em **qualquer** módulo (o `crm` da 008/013, o
 * `financeiro` da 018…) **sem import** — nenhum arquivo desses contextos
 * referencia `src/clientes/**`, o que mantém a regra ESLint
 * `import/no-restricted-paths` verde.
 *
 * Renomeado de `IdentidadeWiringModule` (spec 008, só `PORTA_IDENTIDADE`)
 * nesta spec 013, que acrescenta `PORTA_CAMPO_PERSONALIZADO_PESSOA` — em vez
 * de multiplicar um módulo de wiring de 1 linha por porta nova exposta por
 * `clientes` (research.md D-R3).
 *
 * Vive **dentro** de `src/clientes/`, então importar `ClientesModule` aqui é
 * intra-contexto (permitido). O `AppModule` importa este módulo.
 */
@Global()
@Module({
  imports: [ClientesModule],
  providers: [
    PortaIdentidadeAdapter,
    { provide: PORTA_IDENTIDADE, useExisting: PortaIdentidadeAdapter },
    PortaCampoPersonalizadoPessoaAdapter,
    {
      provide: PORTA_CAMPO_PERSONALIZADO_PESSOA,
      useExisting: PortaCampoPersonalizadoPessoaAdapter,
    },
  ],
  exports: [PORTA_IDENTIDADE, PORTA_CAMPO_PERSONALIZADO_PESSOA],
})
export class ClientesWiringModule {}
