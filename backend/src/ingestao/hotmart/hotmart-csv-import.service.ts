import { Injectable, Logger } from '@nestjs/common';
import { PlataformaOrigem } from '@prisma/client';
import { parseCsvHotmart, type ContaHotmart } from '../adapters/hotmart';
import { RegistrarEventoService } from '../application/registrar-evento.service';

export interface ResumoImportCsvHotmart {
  conta: string;
  linhas: number;
  novos: number;
  dedup: number;
  ignoradas: number;
  erros: string[];
}

/**
 * Import de CSV de vendas da Hotmart (spec 022) — cada linha vira um evento
 * `hotmart.csv` pela porta da etapa 0. Linha malformada **não** aborta o lote
 * (entra em `ignoradas` + `erros`). Idempotente por hash: 2º import → `novos: 0`.
 */
@Injectable()
export class HotmartCsvImportService {
  private readonly logger = new Logger(HotmartCsvImportService.name);

  constructor(private readonly registrar: RegistrarEventoService) {}

  async importar(
    conta: ContaHotmart,
    conteudo: string,
  ): Promise<ResumoImportCsvHotmart> {
    const plataforma =
      conta === 'HOTMART_PRD'
        ? PlataformaOrigem.HOTMART_PRD
        : PlataformaOrigem.HOTMART_SVC;
    const resultados = parseCsvHotmart(conteudo, conta);
    const resumo: ResumoImportCsvHotmart = {
      conta,
      linhas: resultados.length,
      novos: 0,
      dedup: 0,
      ignoradas: 0,
      erros: [],
    };

    for (const r of resultados) {
      if (!r.eventoCanonico || !r.idOrigem) {
        resumo.ignoradas += 1;
        if (r.erros.length) resumo.erros.push(...r.erros);
        continue;
      }
      const { criado } = await this.registrar.registrarEvento({
        plataformaOrigem: plataforma,
        tipoOrigem: r.tipoOrigem,
        idOrigem: r.idOrigem,
        payloadBruto: r.payloadBruto,
        eventoCanonico: r.eventoCanonico,
      });
      if (criado) resumo.novos += 1;
      else resumo.dedup += 1;
    }

    this.logger.log(
      `hotmart.importar-csv conta=${conta} linhas=${resumo.linhas} novos=${resumo.novos} dedup=${resumo.dedup} ignoradas=${resumo.ignoradas}`,
    );
    return resumo;
  }
}
