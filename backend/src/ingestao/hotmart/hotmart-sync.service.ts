import {
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PlataformaOrigem } from '@prisma/client';
import {
  parseVendaApi,
  HOTMART_API_CLIENT,
  HotmartApiIndisponivelError,
  type HotmartApiClient,
} from '../adapters/hotmart';
import { RegistrarEventoService } from '../application/registrar-evento.service';
import type { SincronizarHotmartDto } from './dto/sincronizar.schema';

export interface ResumoSincronizacaoHotmart {
  conta: string;
  paginas: number;
  paginasDetalhePreco: number;
  recebidos: number;
  novos: number;
  dedup: number;
  ignorados: number;
  erros: string[];
}

const MAX_PAGINAS = 2000; // trava de segurança (cursor)

function transactionDe(item: unknown): string | undefined {
  if (!item || typeof item !== 'object') return undefined;
  const t = (item as Record<string, unknown>).transaction;
  return typeof t === 'string' && t.length > 0 ? t : undefined;
}

/**
 * Sincronização **sob demanda** da API da Hotmart — Princípio VIII: nunca um job
 * automático. Como a Hotmart **não tem webhook na v1**, este é o caminho corrente
 * de entrada das contas Hotmart.
 *
 * (1) Pagina `GET /sales/price/details` **por cursor** e monta um
 * `Map<transaction, detalhe>`. (2) Pagina `GET /sales/history` **por cursor**;
 * para cada item, `parseVendaApi(item, conta, mapa.get(transaction))` →
 * `RegistrarEventoService.registrarEvento` (etapa 0). **Commit por página de
 * vendas**: falha na página K não desfaz as anteriores; re-disparar é idempotente
 * (dedup por hash na etapa 0). Detalhe de preço faltando **não** é erro (H-02).
 */
@Injectable()
export class HotmartSyncService {
  private readonly logger = new Logger(HotmartSyncService.name);

  constructor(
    @Inject(HOTMART_API_CLIENT) private readonly api: HotmartApiClient,
    private readonly registrar: RegistrarEventoService,
  ) {}

  async sincronizar(
    dto: SincronizarHotmartDto,
  ): Promise<ResumoSincronizacaoHotmart> {
    const resumo: ResumoSincronizacaoHotmart = {
      conta: dto.conta,
      paginas: 0,
      paginasDetalhePreco: 0,
      recebidos: 0,
      novos: 0,
      dedup: 0,
      ignorados: 0,
      erros: [],
    };
    const plataforma =
      dto.conta === 'HOTMART_PRD'
        ? PlataformaOrigem.HOTMART_PRD
        : PlataformaOrigem.HOTMART_SVC;

    // --- Fase 1: detalhes de preço → mapa por transaction ---
    const detalhes = new Map<string, unknown>();
    let cursorDetalhe: string | undefined;
    for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
      let resultado;
      try {
        resultado = await this.api.listarDetalhesPreco({
          conta: dto.conta,
          dataInicio: dto.dataInicio,
          dataFinal: dto.dataFinal,
          transactionStatus: dto.transactionStatus,
          cursor: cursorDetalhe,
        });
      } catch (err) {
        if (err instanceof HotmartApiIndisponivelError) {
          throw new UnprocessableEntityException({ message: err.message });
        }
        resumo.erros.push(`price/details pagina ${pagina + 1}: ${(err as Error).message}`);
        break;
      }
      resumo.paginasDetalhePreco += 1;
      for (const item of resultado.itens) {
        const tx = transactionDe(item);
        if (tx) detalhes.set(tx, item);
      }
      if (!resultado.proximoCursor) break;
      cursorDetalhe = resultado.proximoCursor;
    }

    // --- Fase 2: vendas → merge + registrar (commit por página) ---
    let cursor: string | undefined;
    for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
      let resultado;
      try {
        resultado = await this.api.listarVendas({
          conta: dto.conta,
          dataInicio: dto.dataInicio,
          dataFinal: dto.dataFinal,
          transactionStatus: dto.transactionStatus,
          cursor,
        });
      } catch (err) {
        if (err instanceof HotmartApiIndisponivelError) {
          throw new UnprocessableEntityException({ message: err.message });
        }
        resumo.erros.push(`sales/history pagina ${pagina + 1}: ${(err as Error).message}`);
        break;
      }

      resumo.paginas += 1;

      for (const item of resultado.itens) {
        resumo.recebidos += 1;
        const tx = itemTransaction(item);
        const parsed = parseVendaApi(item, dto.conta, tx ? detalhes.get(tx) : undefined);
        if (!parsed.eventoCanonico || !parsed.idOrigem) {
          resumo.ignorados += 1;
          resumo.erros.push(
            `venda ${parsed.idOrigem ?? '?'}: ${parsed.erros.join('; ')}`,
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
      `hotmart.sincronizar conta=${resumo.conta} paginas=${resumo.paginas} detalhePreco=${resumo.paginasDetalhePreco} recebidos=${resumo.recebidos} novos=${resumo.novos} dedup=${resumo.dedup} ignorados=${resumo.ignorados}`,
    );
    return resumo;
  }
}

/** `item.purchase.transaction` de um item de `sales/history`. */
function itemTransaction(item: unknown): string | undefined {
  if (!item || typeof item !== 'object') return undefined;
  const purchase = (item as Record<string, unknown>).purchase;
  if (!purchase || typeof purchase !== 'object') return undefined;
  const t = (purchase as Record<string, unknown>).transaction;
  return typeof t === 'string' && t.length > 0 ? t : undefined;
}
