import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { EventoCanonico } from './evento-canonico';

/** Aceita o cliente Prisma normal ou um cliente de transação. */
export type Tx = PrismaService | Prisma.TransactionClient;

// Re-export dos enums do schema (valores + tipos) — o domínio os usa como
// simples mapas de string; não há acoplamento a banco.
export {
  Classificacao,
  EtapaIngestao,
  EventoEtapaStatus,
  EventoOrigemStatus,
  PlataformaOrigem,
} from '@prisma/client';
import type {
  Classificacao,
  EtapaIngestao,
  EventoEtapaStatus,
  PlataformaOrigem,
} from '@prisma/client';

export interface EntradaIngestao {
  plataformaOrigem: PlataformaOrigem;
  tipoOrigem: string;
  idOrigem: string;
  payloadBruto: unknown;
  eventoCanonico?: EventoCanonico;
}

export interface ResultadoIngestao {
  eventoId: string;
  criado: boolean;
}

/** Retorno de um executor de etapa. */
export interface ResultadoEtapa {
  status: 'ok' | 'erro' | 'pulada';
  resultado?: unknown;
  erroDetalhe?: string;
  /** true → o evento vai para `revisar` (ambiguidade de negócio); a etapa em si fica `ok`. */
  revisar?: boolean;
  /** patch derivado a aplicar em `evento_origem` (só `CLASSIFICAR` usa hoje). */
  classificacao?: Classificacao;
  /** motivo do `revisar` — vira `evento_origem.erro_detalhe`. */
  motivo?: string;
}

export interface EtapaCtx {
  eventoId: string;
  tipoOrigem: string;
  canonico: EventoCanonico | null;
  tx: Tx;
}

export type Executor = (ctx: EtapaCtx) => Promise<ResultadoEtapa>;

export type AcaoEtapa = 'EXECUTAR' | 'BLOQUEADA' | 'JA_OK' | 'ESGOTADA';

/** Estado de uma `evento_etapa` como o planejador precisa ver. */
export interface EtapaSnapshot {
  etapa: EtapaIngestao;
  status: EventoEtapaStatus;
  tentativas: number;
  /** derivado de `resultado.revisar` — sinaliza ambiguidade de negócio. */
  revisar?: boolean;
}

export interface ResumoPassada {
  selecionados: number;
  ok: number;
  revisar: number;
  erro: number;
  bloqueadas: number;
  duracaoMs: number;
}
