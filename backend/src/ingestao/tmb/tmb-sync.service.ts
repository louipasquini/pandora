import {
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PlataformaOrigem } from '@prisma/client';
import {
  parsePedidoApi,
  TMB_API_CLIENT,
  TmbApiIndisponivelError,
  type TmbApiClient,
} from '../adapters/tmb';
import { RegistrarEventoService } from '../application/registrar-evento.service';
import type { SincronizarTmbDto } from './dto/sincronizar.schema';

export interface ResumoSincronizacaoTmb {
  paginas: number;
  recebidos: number;
  novos: number;
  dedup: number;
  ignorados: number;
  erros: string[];
}

const MAX_PAGINAS = 500; // trava de segurança

/**
 * Sincronização **sob demanda** da API da TMB (`GET /api/pedidos`) — Princípio
 * VIII: nunca um job automático. Pagina o `TmbApiClient`, transforma cada pedido
 * em `EventoCanonico` (`parsePedidoApi`) e registra pela porta da etapa 0
 * (`RegistrarEventoService`). **Commit por página**: falha na página K não desfaz
 * as anteriores; re-disparar é idempotente (dedup por hash na etapa 0).
 */
@Injectable()
export class TmbSyncService {
  private readonly logger = new Logger(TmbSyncService.name);

  constructor(
    @Inject(TMB_API_CLIENT) private readonly api: TmbApiClient,
    private readonly registrar: RegistrarEventoService,
  ) {}

  async sincronizar(dto: SincronizarTmbDto): Promise<ResumoSincronizacaoTmb> {
    const resumo: ResumoSincronizacaoTmb = {
      paginas: 0,
      recebidos: 0,
      novos: 0,
      dedup: 0,
      ignorados: 0,
      erros: [],
    };

    for (let pageNumber = 1; pageNumber <= MAX_PAGINAS; pageNumber += 1) {
      let pagina;
      try {
        pagina = await this.api.listarPedidos({
          dataInicio: dto.dataInicio,
          dataFinal: dto.dataFinal,
          produtoId: dto.produtoId,
          pageNumber,
          pageSize: dto.pageSize,
        });
      } catch (err) {
        if (err instanceof TmbApiIndisponivelError) {
          throw new UnprocessableEntityException({ message: err.message });
        }
        resumo.erros.push(`pagina ${pageNumber}: ${(err as Error).message}`);
        break;
      }

      resumo.paginas += 1;
      if (pagina.itens.length === 0) break;

      for (const item of pagina.itens) {
        resumo.recebidos += 1;
        const parsed = parsePedidoApi(item);
        if (!parsed.eventoCanonico) {
          resumo.ignorados += 1;
          resumo.erros.push(
            `pedido ${parsed.idOrigem ?? '?'}: ${parsed.erros.join('; ')}`,
          );
          continue;
        }
        const { criado } = await this.registrar.registrarEvento({
          plataformaOrigem: PlataformaOrigem.TMB,
          tipoOrigem: parsed.tipoOrigem,
          idOrigem: parsed.idOrigem as string,
          payloadBruto: parsed.payloadBruto,
          eventoCanonico: parsed.eventoCanonico,
        });
        if (criado) resumo.novos += 1;
        else resumo.dedup += 1;
      }

      if (!pagina.temProximaPagina) break;
    }

    this.logger.log(
      `tmb.sincronizar paginas=${resumo.paginas} recebidos=${resumo.recebidos} novos=${resumo.novos} dedup=${resumo.dedup} ignorados=${resumo.ignorados}`,
    );
    return resumo;
  }
}
