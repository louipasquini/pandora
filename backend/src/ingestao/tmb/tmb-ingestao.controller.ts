import {
  Body,
  Controller,
  HttpCode,
  Post,
  UnprocessableEntityException,
} from '@nestjs/common';
import { RequerPermissao } from '../../auth/rbac/decorators/requer-permissao.decorator';
import { importarCsvTmbSchema } from './dto/importar-csv.schema';
import { sincronizarTmbSchema } from './dto/sincronizar.schema';
import { TmbCsvImportService } from './tmb-csv-import.service';
import { TmbSyncService } from './tmb-sync.service';

/**
 * Ingestão TMB **sob demanda** (spec 019) — autenticada, permissão já existente
 * `evento:ingerir` (catálogo desde a 006). Nenhuma permissão nova. Invólucros
 * finos: validam o corpo e delegam aos services, que só chamam a porta da
 * etapa 0.
 */
@Controller('ingestao/tmb')
export class TmbIngestaoController {
  constructor(
    private readonly sync: TmbSyncService,
    private readonly csv: TmbCsvImportService,
  ) {}

  @RequerPermissao('evento:ingerir')
  @Post('sincronizar')
  @HttpCode(200)
  async sincronizar(@Body() body: unknown) {
    const parsed = sincronizarTmbSchema.safeParse(body ?? {});
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
    const parsed = importarCsvTmbSchema.safeParse(body);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        message: 'corpo inválido',
        detalhes: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
    }
    return this.csv.importar(parsed.data.conteudo);
  }
}
