import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { CoreModule } from './core/core.module';
import { HealthModule } from './health/health.module';
import { IngestaoModule } from './ingestao/ingestao.module';
import { FinanceiroModule } from './financeiro/financeiro.module';
import { CatalogoModule } from './catalogo/catalogo.module';
import { ContratosModule } from './contratos/contratos.module';
import { ClientesModule } from './clientes/clientes.module';
import { CrmModule } from './crm/crm.module';
import { MarketingModule } from './marketing/marketing.module';
import { CentralModule } from './central/central.module';
import { ApiModule } from './api/api.module';
import { AdminModule } from './admin/admin.module';

/**
 * Composição raiz. Um módulo por bounded context (Princípio VI) — os 11 nomes
 * batem com `CONTEXT_MODULES` (app.context-modules.ts), que alimenta o /health.
 */
@Module({
  imports: [
    // Infra transversal
    ConfigModule,
    PrismaModule,
    HealthModule,
    // Bounded contexts
    CoreModule,
    IngestaoModule,
    FinanceiroModule,
    CatalogoModule,
    ContratosModule,
    ClientesModule,
    CrmModule,
    MarketingModule,
    CentralModule,
    ApiModule,
    AdminModule,
  ],
})
export class AppModule {}
