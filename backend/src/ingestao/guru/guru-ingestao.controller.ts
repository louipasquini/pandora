import {
  Body,
  Controller,
  HttpCode,
  Post,
  UnprocessableEntityException,
} from '@nestjs/common';
import { RequerPermissao } from '../../auth/rbac/decorators/requer-permissao.decorator';
import { importarCsvGuruSchema } from './dto/importar-csv.schema';
import { sincronizarGuruSchema } from './dto/sincronizar.schema';
import { GuruCsvImportService } from './guru-csv-import.service';
import { GuruSyncService } from './guru-sync.service';

/**
 * Ingestão Guru **sob demanda** (spec 021) — autenticada, permissão já existente
 * `evento:ingerir` (catálogo desde a 006). Nenhuma permissão nova. Invólucros
 * finos: validam o corpo (`conta` obrigatória — o webhook a tira do path, aqui
 * não há; a janela da sincronização não pode passar de 180 dias) e delegam aos
 * services, que só chamam a porta da etapa 0.
 */
@Controller('ingestao/guru')
export class GuruIngestaoController {
  constructor(
    private readonly sync: GuruSyncService,
    private readonly csv: GuruCsvImportService,
  ) {}

  @RequerPermissao('evento:ingerir')
  @Post('sincronizar')
  @HttpCode(200)
  async sincronizar(@Body() body: unknown) {
    const parsed = sincronizarGuruSchema.safeParse(body ?? {});
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
    const parsed = importarCsvGuruSchema.safeParse(body);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        message: 'corpo inválido',
        detalhes: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
    }
    return this.csv.importar(parsed.data.conta, parsed.data.conteudo);
  }
}
