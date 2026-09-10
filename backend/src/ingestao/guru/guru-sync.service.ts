import {
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PlataformaOrigem } from '@prisma/client';
import {
  parseTransacaoApi,
  GURU_API_CLIENT,
  GuruApiIndisponivelError,
  type GuruApiClient,
} from '../adapters/guru';
import { RegistrarEventoService } from '../application/registrar-evento.service';
import type { SincronizarGuruDto } from './dto/sincronizar.schema';

export interface ResumoSincronizacaoGuru {
  conta: string;
  paginas: number;
  recebidos: number;
  novos: number;
  dedup: number;
  ignorados: number;
  erros: string[];
}

const MAX_PAGINAS = 2000; // trava de segurança (cursor)

/**
 * Sincronização **sob demanda** da API da Guru (`GET /api/v2/transactions`) —
 * Princípio VIII: nunca um job automático. Pagina o `GuruApiClient` da conta
 * indicada **por cursor** (`next_cursor` enquanto `has_more_pages`), transforma
 * cada transação em `EventoCanonico` (`parseTransacaoApi`) e registra pela porta
 * da etapa 0 (`RegistrarEventoService`). **Commit por página**: falha na página K
 * não desfaz as anteriores; re-disparar é idempotente (dedup por hash na etapa
 * 0).
 */
@Injectable()
export class GuruSyncService {
  private readonly logger = new Logger(GuruSyncService.name);

  constructor(
    @Inject(GURU_API_CLIENT) private readonly api: GuruApiClient,
    private readonly registrar: RegistrarEventoService,
  ) {}

  async sincronizar(dto: SincronizarGuruDto): Promise<ResumoSincronizacaoGuru> {
    const resumo: ResumoSincronizacaoGuru = {
      conta: dto.conta,
      paginas: 0,
      recebidos: 0,
      novos: 0,
      dedup: 0,
      ignorados: 0,
      erros: [],
    };
    const plataforma =
      dto.conta === 'GURU_PRD'
        ? PlataformaOrigem.GURU_PRD
        : PlataformaOrigem.GURU_SVC;

    let cursor: string | undefined;
    for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
      let resultado;
      try {
        resultado = await this.api.listarTransacoes({
          conta: dto.conta,
          dataInicio: dto.dataInicio,
          dataFinal: dto.dataFinal,
          campoData: dto.campoData,
          cursor,
        });
      } catch (err) {
        if (err instanceof GuruApiIndisponivelError) {
          throw new UnprocessableEntityException({ message: err.message });
        }
        resumo.erros.push(`pagina ${pagina + 1}: ${(err as Error).message}`);
        break;
      }

      resumo.paginas += 1;

      for (const item of resultado.itens) {
        resumo.recebidos += 1;
        const parsed = parseTransacaoApi(item, dto.conta);
        if (!parsed.eventoCanonico || !parsed.idOrigem) {
          resumo.ignorados += 1;
          resumo.erros.push(
            `transacao ${parsed.idOrigem ?? '?'}: ${parsed.erros.join('; ')}`,
          );
          continue;
        }
        const { criado } = await this.registrar.registrarEvento({
          plataformaOrigem: plataforma,
          tipoOrigem: parsed.tipoOrigem,
          idOrigem: parsed.idOrigem,
          payloadBruto: parsed.payloadBruto,
          eventoCanonico: parsed.eventoCanonico,
        });
        if (criado) resumo.novos += 1;
        else resumo.dedup += 1;
      }

      if (!resultado.proximoCursor) break;
      cursor = resultado.proximoCursor;
    }

    this.logger.log(
      `guru.sincronizar conta=${resumo.conta} paginas=${resumo.paginas} recebidos=${resumo.recebidos} novos=${resumo.novos} dedup=${resumo.dedup} ignorados=${resumo.ignorados}`,
    );
    return resumo;
  }
}
