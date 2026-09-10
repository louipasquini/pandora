import { Injectable, Logger } from '@nestjs/common';
import { PlataformaOrigem } from '@prisma/client';
import { parseCsvAsaas, type ContaAsaas } from '../adapters/asaas';
import { RegistrarEventoService } from '../application/registrar-evento.service';

export interface ResumoImportCsvAsaas {
  conta: string;
  linhas: number;
  novos: number;
  dedup: number;
  ignoradas: number;
  erros: string[];
}

/**
 * Import de CSV de cobranças da Asaas (spec 020) — cada linha vira um evento
 * `asaas.csv` pela porta da etapa 0. Linha malformada **não** aborta o lote
 * (entra em `ignoradas` + `erros`). Idempotente por hash: 2º import → `novos: 0`.
 */
@Injectable()
export class AsaasCsvImportService {
  private readonly logger = new Logger(AsaasCsvImportService.name);

  constructor(private readonly registrar: RegistrarEventoService) {}

  async importar(conta: ContaAsaas, conteudo: string): Promise<ResumoImportCsvAsaas> {
    const plataforma =
      conta === 'ASAAS_PRD'
        ? PlataformaOrigem.ASAAS_PRD
        : PlataformaOrigem.ASAAS_SVC;
    const resultados = parseCsvAsaas(conteudo, conta);
    const resumo: ResumoImportCsvAsaas = {
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
      `asaas.importar-csv conta=${conta} linhas=${resumo.linhas} novos=${resumo.novos} dedup=${resumo.dedup} ignoradas=${resumo.ignoradas}`,
    );
    return resumo;
  }
}
