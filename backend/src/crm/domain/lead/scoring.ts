/**
 * Lead scoring (spec 008) — **derivado**, nunca contador incremental (regra 8.2.2
 * da visão). `calcularScore(estado)` é **pura, determinística e livre de locale**:
 * mesma entrada → mesmo inteiro, em qualquer `TZ` (a "idade" e a "recência" são
 * medidas em UTC via `agoraUtc()`).
 *
 * A tabela de pesos `PESOS_SCORE_LEAD` é **congelada no código** nesta v1 (ajuste
 * = PR revisável). Regras configuráveis em runtime são de uma spec de CRM
 * posterior. O valor materializado em `lead.score` é só _cache_ de leitura,
 * reconstruível idêntico a qualquer momento.
 */
import { agoraUtc } from '../../../core/core.module';
import type { EstadoScoreLead, LeadEstagio } from './tipos';

export const PESOS_SCORE_LEAD = Object.freeze({
  contato: { email: 12, telefone: 8, documento: 5 },
  origem: { comUtm: 10, semUtm: 4 },
  estagio: {
    NOVO: 0,
    CONTATO_FEITO: 10,
    QUALIFICADO: 25,
    NUTRICAO: 15,
    DESQUALIFICADO: -20,
  } satisfies Record<LeadEstagio, number>,
  engajamento: { porInteracao: 4, tetoInteracoes: 5, comTag: 5 },
  recencia: { ate3d: 15, ate14d: 8, ate30d: 3 },
  decaimento: { idadeDias: 30, penalidade: -10 },
  limites: { min: 0, max: 100 },
});

const MS_DIA = 86_400_000;

function idadeEmDias(isoRef: string, agora: number): number {
  const t = Date.parse(isoRef);
  if (!Number.isFinite(t)) return 0;
  return Math.floor((agora - t) / MS_DIA);
}

/** `f(estado) -> inteiro [0,100]`. Nunca `NaN`, nunca `null`. */
export function calcularScore(estado: EstadoScoreLead): number {
  const P = PESOS_SCORE_LEAD;
  const agora = agoraUtc().getTime();
  let soma = 0;

  // Completude de contato
  if (estado.temEmail) soma += P.contato.email;
  if (estado.temTelefone) soma += P.contato.telefone;
  if (estado.temDocumento) soma += P.contato.documento;

  // Origem rastreável
  if (estado.temUtm) soma += P.origem.comUtm;
  else if (estado.origem != null && estado.origem !== '') soma += P.origem.semUtm;

  // Estágio no funil
  soma += P.estagio[estado.estagio] ?? 0;

  // Engajamento
  const interacoes = Math.max(0, Math.min(estado.qtdInteracoes, P.engajamento.tetoInteracoes));
  soma += interacoes * P.engajamento.porInteracao;
  if (estado.qtdTags >= 1) soma += P.engajamento.comTag;

  // Recência (última interação, senão criação)
  const idadeRecencia = idadeEmDias(estado.ultimaInteracaoEm ?? estado.criadoEm, agora);
  if (idadeRecencia <= 3) soma += P.recencia.ate3d;
  else if (idadeRecencia <= 14) soma += P.recencia.ate14d;
  else if (idadeRecencia <= 30) soma += P.recencia.ate30d;

  // Decaimento por idade sem engajamento
  const idadeLead = idadeEmDias(estado.criadoEm, agora);
  if (idadeLead > P.decaimento.idadeDias && estado.qtdInteracoes === 0) {
    soma += P.decaimento.penalidade;
  }

  const n = Math.round(soma);
  return Math.max(P.limites.min, Math.min(P.limites.max, Number.isFinite(n) ? n : P.limites.min));
}
