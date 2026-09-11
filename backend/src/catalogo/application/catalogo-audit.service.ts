import { Injectable } from '@nestjs/common';
import { EntidadeId, OrigemMudanca, agoraUtc, montarRegistroAuditoria } from '../../core/core.module';
import { PrismaService } from '../../prisma/prisma.service';

export interface EntradaAuditoriaCatalogo {
  autor: string;
  entidade: string;
  entidadeId: string;
  campo: string;
  valorAnterior: unknown;
  valorNovo: unknown;
  motivo: string;
}

/**
 * Auditoria do contexto `catalogo` (spec 023) — forma canônica `RegistroAuditoria`
 * do core, `origem = AJUSTE_MANUAL`, **append-only**. Simétrico ao
 * `CrmAdminAuditService`/`ClientesAuditService`. Cobre toda escrita de curadoria
 * de `produto`/`oferta`/`oferta_catalogo` — a ingestão automática (etapa 5,
 * import de CSV) **não** audita aqui (registro dela é `evento_etapa.resultado`
 * / contagens de import, não curadoria).
 */
@Injectable()
export class CatalogoAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(e: EntradaAuditoriaCatalogo): Promise<void> {
    const registro = montarRegistroAuditoria({
      autor: e.autor,
      quando: agoraUtc(),
      entidade: e.entidade,
      entidadeId: e.entidadeId,
      campo: e.campo,
      valorAnterior: e.valorAnterior,
      valorNovo: e.valorNovo,
      motivo: e.motivo,
      origem: OrigemMudanca.AJUSTE_MANUAL,
    });

    await this.prisma.catalogoAudit.create({
      data: {
        id: EntidadeId.novo().value,
        autor: registro.autor,
        quando: registro.quando,
        entidade: registro.entidade,
        entidadeId: registro.entidadeId,
        campo: registro.campo,
        valorAnterior: (registro.valorAnterior ?? null) as never,
        valorNovo: (registro.valorNovo ?? null) as never,
        motivo: registro.motivo,
        origem: registro.origem,
      },
    });
  }

  async registrarTodas(entradas: EntradaAuditoriaCatalogo[]): Promise<void> {
    for (const e of entradas) await this.registrar(e);
  }
}
