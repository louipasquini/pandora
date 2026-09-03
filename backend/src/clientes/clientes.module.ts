import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { PERMISSOES } from '../auth/rbac/catalogo';
import { PessoaController } from './pessoa.controller';
import { ContaController } from './conta.controller';
import { PessoaRepository } from './infra/pessoa.repository';
import { ContaRepository } from './infra/conta.repository';
import { ClientesAuditService } from './application/clientes-audit.service';
import { NotaReconciliacaoService } from './application/nota-reconciliacao.service';
import { PessoaService } from './application/pessoa.service';
import { ContaService } from './application/conta.service';
import { MergeService } from './application/merge.service';
import { ResolverOuCriarService } from './application/resolver-ou-criar.service';

/**
 * `clientes` (spec 005) — 1º _bounded context_ de domínio com entidade de negócio.
 * Dono de `pessoa` e `conta`. Importa só `core` (global) e tipos de `auth` (infra
 * transversal — o decorator/`Permissao`); **não** importa `contratos`/`financeiro`/
 * `crm` (ESLint `import/no-restricted-paths`). `CONTEXT_MODULES` segue com 11.
 *
 * **Exporta `ResolverOuCriarService`** — a porta que a spec 018 (pipeline, etapa
 * "resolver pessoa") vai consumir.
 */
@Module({
  controllers: [PessoaController, ContaController],
  providers: [
    PessoaRepository,
    ContaRepository,
    ClientesAuditService,
    NotaReconciliacaoService,
    PessoaService,
    ContaService,
    MergeService,
    ResolverOuCriarService,
  ],
  exports: [ResolverOuCriarService],
})
export class ClientesModule implements OnModuleInit {
  private readonly logger = new Logger('ClientesModule');

  onModuleInit(): void {
    const recursos = new Set(
      PERMISSOES.filter((p) => p.recurso === 'pessoa' || p.recurso === 'conta').map(
        (p) => p.id,
      ),
    );
    this.logger.log(
      `clientes.ready pessoa+conta permissoes=${recursos.size} (${[...recursos].join(', ')})`,
    );
  }
}
