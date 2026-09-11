import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { PERMISSOES } from '../auth/rbac/catalogo';
import {
  CatalogoAuditService,
  ImportarCatalogoHotmartService,
  OfertaService,
  ProdutoService,
  ResolverOfertaEtapaService,
} from './application';
import { CatalogoHotmartImportController } from './catalogo-hotmart-import.controller';
import { JanelaLancamentoRepository } from './infra/janela-lancamento.repository';
import { OfertaRepository } from './infra/oferta.repository';
import { ProdutoRepository } from './infra/produto.repository';
import { OfertaController } from './oferta.controller';
import { ProdutoController } from './produto.controller';

/**
 * `catalogo` (spec 023) — dono de `produto`/`oferta`. 4º _bounded context_ de
 * domínio com entidade de negócio (`clientes`/`ingestao`/`financeiro` são os
 * outros). Importa **só** `core` (contrato de executor externo, `Dinheiro`,
 * `EntidadeId`) — não importa `ingestao`/`financeiro`/`clientes`. O único
 * import cruzado é feito por `src/pipeline-wiring.module.ts` (fora dos dirs de
 * contexto). `CONTEXT_MODULES` segue com 11.
 *
 * `ResolverOfertaEtapaService` é exportado para o `pipeline-wiring.module.ts`
 * registrar como o 3º executor externo do `WorkerService`.
 */
@Module({
  controllers: [ProdutoController, OfertaController, CatalogoHotmartImportController],
  providers: [
    ProdutoRepository,
    OfertaRepository,
    JanelaLancamentoRepository,
    CatalogoAuditService,
    ProdutoService,
    OfertaService,
    ImportarCatalogoHotmartService,
    ResolverOfertaEtapaService,
  ],
  exports: [ResolverOfertaEtapaService],
})
export class CatalogoModule implements OnModuleInit {
  private readonly logger = new Logger('CatalogoModule');

  onModuleInit(): void {
    const perms = PERMISSOES.filter((p) => p.recurso === 'produto' || p.recurso === 'oferta').map(
      (p) => p.id,
    );
    this.logger.log(
      `catalogo.ready etapas=[RESOLVER_OFERTA] permissoes=${perms.length} (${perms.join(', ')})`,
    );
  }
}
