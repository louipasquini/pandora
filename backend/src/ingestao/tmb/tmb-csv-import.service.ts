import { Injectable, Logger } from '@nestjs/common';
import { PlataformaOrigem } from '@prisma/client';
import { parseCsv } from '../adapters/tmb';
import { RegistrarEventoService } from '../application/registrar-evento.service';

export interface ResumoImportCsvTmb {
  linhas: number;
  novos: number;
  dedup: number;
  ignoradas: number;
  erros: string[];
}

/**
 * Import de CSV da TMB (spec 019) — cada linha vira um evento `tmb.csv` pela
 * porta da etapa 0. Linha malformada **não** aborta o lote (entra em
 * `ignoradas` + `erros`). Idempotente por hash: 2º import → `novos: 0`.
 */
@Injectable()
export class TmbCsvImportService {
  private readonly logger = new Logger(TmbCsvImportService.name);

  constructor(private readonly registrar: RegistrarEventoService) {}

  async importar(conteudo: string): Promise<ResumoImportCsvTmb> {
    const resultados = parseCsv(conteudo);
    const resumo: ResumoImportCsvTmb = {
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
        plataformaOrigem: PlataformaOrigem.TMB,
        tipoOrigem: r.tipoOrigem,
        idOrigem: r.idOrigem,
        payloadBruto: r.payloadBruto,
        eventoCanonico: r.eventoCanonico,
      });
      if (criado) resumo.novos += 1;
      else resumo.dedup += 1;
    }

    this.logger.log(
      `tmb.importar-csv linhas=${resumo.linhas} novos=${resumo.novos} dedup=${resumo.dedup} ignoradas=${resumo.ignoradas}`,
    );
    return resumo;
  }
}
