import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { z, type ZodTypeAny } from 'zod';
import { RequerPermissao } from '../auth/rbac/decorators/requer-permissao.decorator';
import { ImportarCatalogoHotmartService } from './application';
import { importarCsvSchema, importarOfertasCsvSchema } from './dto/importar-csv.schema';

function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new BadRequestException({
      message: 'entrada inválida',
      detalhes: r.error.issues.map((i) => `${i.path.join('.') || '_'}: ${i.message}`),
    });
  }
  return r.data;
}

/**
 * Import do catálogo Hotmart (spec 023, D-11/D-12) — 3 dos 4 CSVs da v1
 * (`afiliados.csv` é escopo da spec 026). Reusa `oferta:editar` (importar
 * catálogo é curadoria em lote — 0 permissão nova só para isso). CSV trafega
 * como texto simples no corpo JSON (0 dep de upload binário, mesmo padrão das
 * specs 015/019–022).
 */
@Controller('catalogo/hotmart')
export class CatalogoHotmartImportController {
  constructor(private readonly importar: ImportarCatalogoHotmartService) {}

  @RequerPermissao('oferta:editar')
  @Post('importar-produtos')
  importarProdutos(@Body() body: unknown) {
    return this.importar.importarProdutos(parse(importarCsvSchema, body).csv);
  }

  @RequerPermissao('oferta:editar')
  @Post('importar-ofertas')
  importarOfertas(@Body() body: unknown) {
    const dto = parse(importarOfertasCsvSchema, body);
    return this.importar.importarOfertas(dto.csv, dto.conta);
  }

  @RequerPermissao('oferta:editar')
  @Post('importar-lancamentos')
  importarLancamentos(@Body() body: unknown) {
    return this.importar.importarLancamentos(parse(importarCsvSchema, body).csv);
  }
}
