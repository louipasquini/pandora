import { Global, Module } from '@nestjs/common';
import { PORTA_IDENTIDADE } from '../core/core.module';
import { ClientesModule } from './clientes.module';
import { PortaIdentidadeAdapter } from './infra/porta-identidade.adapter';

/**
 * Wiring da spec 008 — módulo **`@Global()`** que expõe o token `PORTA_IDENTIDADE`
 * do `core` implementado pelo adaptador da 005. Por ser global, o token fica
 * injetável em **qualquer** módulo (o `crm` da 008, o `financeiro` da 018…) **sem
 * import** — nenhum arquivo desses contextos referencia `src/clientes/**`, o que
 * mantém a regra ESLint `import/no-restricted-paths` verde.
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
  ],
  exports: [PORTA_IDENTIDADE],
})
export class IdentidadeWiringModule {}
