import {
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PlataformaOrigem } from '@prisma/client';
import {
  parsePagamentoApi,
  ASAAS_API_CLIENT,
  AsaasApiIndisponivelError,
  type AsaasApiClient,
} from '../adapters/asaas';
import { RegistrarEventoService } from '../application/registrar-evento.service';
import type { SincronizarAsaasDto } from './dto/sincronizar.schema';

export interface ResumoSincronizacaoAsaas {
  conta: string;
  paginas: number;
  recebidos: number;
  novos: number;
  dedup: number;
  ignorados: number;
  erros: string[];
}

const MAX_PAGINAS = 1000; // trava de segurança

/**
 * Sincronização **sob demanda** da API da Asaas (`GET /v3/payments`) — Princípio
 * VIII: nunca um job automático. Pagina o `AsaasApiClient` da conta indicada,
 * transforma cada cobrança em `EventoCanonico` (`parsePagamentoApi`) e registra
 * pela porta da etapa 0 (`RegistrarEventoService`). **Commit por página**: falha
 * na página K não desfaz as anteriores; re-disparar é idempotente (dedup por
 * hash na etapa 0).
 */
@Injectable()
export class AsaasSyncService {
  private readonly logger = new Logger(AsaasSyncService.name);

  constructor(
    @Inject(ASAAS_API_CLIENT) private readonly api: AsaasApiClient,
    private readonly registrar: RegistrarEventoService,
  ) {}

  async sincronizar(dto: SincronizarAsaasDto): Promise<ResumoSincronizacaoAsaas> {
    const resumo: ResumoSincronizacaoAsaas = {
      conta: dto.conta,
      paginas: 0,
      recebidos: 0,
      novos: 0,
      dedup: 0,
      ignorados: 0,
      erros: [],
    };
    const plataforma =
      dto.conta === 'ASAAS_PRD'
        ? PlataformaOrigem.ASAAS_PRD
        : PlataformaOrigem.ASAAS_SVC;

    for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
      let resultado;
      try {
        resultado = await this.api.listarPagamentos({
          conta: dto.conta,
          dataInicio: dto.dataInicio,
          dataFinal: dto.dataFinal,
          offset: pagina * dto.limit,
          limit: dto.limit,
        });
      } catch (err) {
        if (err instanceof AsaasApiIndisponivelError) {
          throw new UnprocessableEntityException({ message: err.message });
        }
        resumo.erros.push(`pagina ${pagina + 1}: ${(err as Error).message}`);
        break;
      }

      resumo.paginas += 1;
      if (resultado.itens.length === 0) break;

      for (const item of resultado.itens) {
        resumo.recebidos += 1;
        const parsed = parsePagamentoApi(item, dto.conta);
        if (!parsed.eventoCanonico || !parsed.idOrigem) {
          resumo.ignorados += 1;
          resumo.erros.push(
            `cobranca ${parsed.idOrigem ?? '?'}: ${parsed.erros.join('; ')}`,
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

      if (!resultado.temProximaPagina) break;
    }

    this.logger.log(
      `asaas.sincronizar conta=${resumo.conta} paginas=${resumo.paginas} recebidos=${resumo.recebidos} novos=${resumo.novos} dedup=${resumo.dedup} ignorados=${resumo.ignorados}`,
    );
    return resumo;
  }
}
