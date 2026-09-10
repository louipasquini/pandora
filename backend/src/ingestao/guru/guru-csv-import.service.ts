import { Injectable, Logger } from '@nestjs/common';
import { PlataformaOrigem } from '@prisma/client';
import { parseCsvGuru, type ContaGuru } from '../adapters/guru';
import { RegistrarEventoService } from '../application/registrar-evento.service';

export interface ResumoImportCsvGuru {
  conta: string;
  linhas: number;
  novos: number;
  dedup: number;
  ignoradas: number;
  erros: string[];
}

/**
 * Import de CSV de vendas da Guru (spec 021) — cada linha vira um evento
 * `guru.csv` pela porta da etapa 0. Linha malformada **não** aborta o lote
 * (entra em `ignoradas` + `erros`). Idempotente por hash: 2º import → `novos: 0`.
 */
@Injectable()
export class GuruCsvImportService {
  private readonly logger = new Logger(GuruCsvImportService.name);

  constructor(private readonly registrar: RegistrarEventoService) {}

  async importar(conta: ContaGuru, conteudo: string): Promise<ResumoImportCsvGuru> {
    const plataforma =
      conta === 'GURU_PRD'
        ? PlataformaOrigem.GURU_PRD
        : PlataformaOrigem.GURU_SVC;
    const resultados = parseCsvGuru(conteudo, conta);
    const resumo: ResumoImportCsvGuru = {
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
      `guru.importar-csv conta=${conta} linhas=${resumo.linhas} novos=${resumo.novos} dedup=${resumo.dedup} ignoradas=${resumo.ignoradas}`,
    );
    return resumo;
  }
}
