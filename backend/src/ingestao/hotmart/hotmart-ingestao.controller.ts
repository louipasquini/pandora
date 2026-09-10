import {
  Body,
  Controller,
  HttpCode,
  Post,
  UnprocessableEntityException,
} from '@nestjs/common';
import { RequerPermissao } from '../../auth/rbac/decorators/requer-permissao.decorator';
import { importarCsvHotmartSchema } from './dto/importar-csv.schema';
import { sincronizarHotmartSchema } from './dto/sincronizar.schema';
import { HotmartCsvImportService } from './hotmart-csv-import.service';
import { HotmartSyncService } from './hotmart-sync.service';

/**
 * Ingestão Hotmart **sob demanda** (spec 022) — autenticada, permissão já
 * existente `evento:ingerir` (catálogo desde a 006). Nenhuma permissão nova.
 * Invólucros finos: validam o corpo (`conta` obrigatória; a janela da
 * sincronização não pode passar de 365 dias) e delegam aos services, que só
 * chamam a porta da etapa 0. A Hotmart **não tem webhook na v1** — a
 * sincronização é o caminho corrente.
 */
@Controller('ingestao/hotmart')
export class HotmartIngestaoController {
  constructor(
    private readonly sync: HotmartSyncService,
    private readonly csv: HotmartCsvImportService,
  ) {}

  @RequerPermissao('evento:ingerir')
  @Post('sincronizar')
  @HttpCode(200)
  async sincronizar(@Body() body: unknown) {
    const parsed = sincronizarHotmartSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        message: 'corpo inválido',
        detalhes: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
    }
    return this.sync.sincronizar(parsed.data);
  }

  @RequerPermissao('evento:ingerir')
  @Post('importar-csv')
  @HttpCode(200)
  async importarCsv(@Body() body: unknown) {
    const parsed = importarCsvHotmartSchema.safeParse(body);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        message: 'corpo inválido',
        detalhes: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
    }
    return this.csv.importar(parsed.data.conta, parsed.data.conteudo);
  }
}
