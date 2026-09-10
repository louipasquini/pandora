import {
  Body,
  Controller,
  HttpCode,
  Post,
  UnprocessableEntityException,
} from '@nestjs/common';
import { RequerPermissao } from '../../auth/rbac/decorators/requer-permissao.decorator';
import { importarCsvAsaasSchema } from './dto/importar-csv.schema';
import { sincronizarAsaasSchema } from './dto/sincronizar.schema';
import { AsaasCsvImportService } from './asaas-csv-import.service';
import { AsaasSyncService } from './asaas-sync.service';

/**
 * Ingestão Asaas **sob demanda** (spec 020) — autenticada, permissão já existente
 * `evento:ingerir` (catálogo desde a 006). Nenhuma permissão nova. Invólucros
 * finos: validam o corpo (`conta` obrigatória — o webhook a tira do path, aqui
 * não há) e delegam aos services, que só chamam a porta da etapa 0.
 */
@Controller('ingestao/asaas')
export class AsaasIngestaoController {
  constructor(
    private readonly sync: AsaasSyncService,
    private readonly csv: AsaasCsvImportService,
  ) {}

  @RequerPermissao('evento:ingerir')
  @Post('sincronizar')
  @HttpCode(200)
  async sincronizar(@Body() body: unknown) {
    const parsed = sincronizarAsaasSchema.safeParse(body ?? {});
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
    const parsed = importarCsvAsaasSchema.safeParse(body);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        message: 'corpo inválido',
        detalhes: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
    }
    return this.csv.importar(parsed.data.conta, parsed.data.conteudo);
  }
}
