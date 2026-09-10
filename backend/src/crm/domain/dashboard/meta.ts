/**
 * Metas comerciais (spec 017, US4 / CL-02 / research.md D-R6/D-R7) — o alvo é
 * o **único** dado persistido; `realizado`/`percentual`/`status` são sempre
 * derivados na leitura pela mesma query da métrica. Catálogo de métricas
 * **fechado** — meta só pode apontar para algo que o dashboard sabe calcular.
 */

export interface MetricaMetaDef {
  readonly id: string;
  readonly rotulo: string;
  /** `true` = alvo/realizado são `Dinheiro` (a meta fixa `alvoMoeda`). */
  readonly monetaria: boolean;
}

export const METRICAS_META = Object.freeze([
  {
    id: 'oportunidades_ganhas',
    rotulo: 'Oportunidades ganhas',
    monetaria: false,
  },
  { id: 'valor_ganho', rotulo: 'Valor ganho', monetaria: true },
  { id: 'leads_novos', rotulo: 'Leads novos', monetaria: false },
  { id: 'tarefas_concluidas', rotulo: 'Tarefas concluídas', monetaria: false },
  {
    id: 'atendimentos_encerrados',
    rotulo: 'Atendimentos encerrados',
    monetaria: false,
  },
] as const satisfies readonly MetricaMetaDef[]);

export type MetricaMetaId = (typeof METRICAS_META)[number]['id'];

export const METRICA_META_IDS: ReadonlySet<string> = new Set(METRICAS_META.map((m) => m.id));

export function metricaMetaPorId(id: string): MetricaMetaDef | undefined {
  return METRICAS_META.find((m) => m.id === id);
}

export type MetaPeriodoTipo = 'MES' | 'TRIMESTRE';

export interface IntervaloPeriodo {
  inicio: Date;
  fim: Date;
}

/**
 * `inicio`/`fim` do período de uma meta, derivados de `(periodo, referencia)`
 * — America/Sao_Paulo (UTC−3, sem horário de verão desde 2019 — o Brasil não
 * observa mais DST, então o offset é fixo; mesma simplificação segura de
 * `estaEmExpediente`). `referencia` é uma data (`YYYY-MM-DD`), tratada como o
 * dia civil local do 1º dia do período.
 */
const OFFSET_BR_MIN = 180; // UTC−3

function inicioDiaLocalUtc(ano: number, mes1a12: number, dia: number): Date {
  return new Date(Date.UTC(ano, mes1a12 - 1, dia, 0, 0, 0) + OFFSET_BR_MIN * 60_000);
}

export function periodoDaMeta(
  periodo: MetaPeriodoTipo,
  referencia: Date,
): IntervaloPeriodo {
  // `referencia` vem como @db.Date — meia-noite UTC do dia. Extraímos Y/M/D em UTC.
  const ano = referencia.getUTCFullYear();
  const mes = referencia.getUTCMonth() + 1; // 1..12

  if (periodo === 'MES') {
    const inicio = inicioDiaLocalUtc(ano, mes, 1);
    const fim = new Date(inicioDiaLocalUtc(mes === 12 ? ano + 1 : ano, mes === 12 ? 1 : mes + 1, 1).getTime() - 1);
    return { inicio, fim };
  }

  // TRIMESTRE — normaliza `mes` para o 1º mês do trimestre.
  const mesTri = Math.floor((mes - 1) / 3) * 3 + 1; // 1,4,7,10
  const inicio = inicioDiaLocalUtc(ano, mesTri, 1);
  const proximo = mesTri + 3;
  const fim = new Date(
    inicioDiaLocalUtc(proximo > 12 ? ano + 1 : ano, proximo > 12 ? proximo - 12 : proximo, 1).getTime() - 1,
  );
  return { inicio, fim };
}

/** Normaliza uma `referencia` livre para o 1º dia do mês/trimestre (UTC date). */
export function normalizarReferencia(periodo: MetaPeriodoTipo, referencia: Date): Date {
  const ano = referencia.getUTCFullYear();
  const mes = referencia.getUTCMonth() + 1;
  const mesAlvo = periodo === 'MES' ? mes : Math.floor((mes - 1) / 3) * 3 + 1;
  return new Date(Date.UTC(ano, mesAlvo - 1, 1));
}

export type StatusMeta = 'no_caminho' | 'em_risco' | 'batida' | 'estourada';

export interface AtingimentoMeta {
  percentual: number | null;
  status: StatusMeta;
  /** `true` se o ritmo atual projeta bater o alvo até o fim do período. */
  noRitmo: boolean;
}

/** Margem de tolerância antes de marcar `em_risco` (10 p.p. de folga). */
const MARGEM_RISCO = 0.1;

export function statusMeta(
  realizado: number,
  alvo: number,
  intervalo: IntervaloPeriodo,
  agora: Date,
): AtingimentoMeta {
  const percentual = alvo === 0 ? null : realizado / alvo;

  if (alvo > 0 && realizado >= alvo) {
    return { percentual, status: 'batida', noRitmo: true };
  }

  const totalMs = intervalo.fim.getTime() - intervalo.inicio.getTime();
  const decorridoMs = Math.min(
    Math.max(agora.getTime() - intervalo.inicio.getTime(), 0),
    totalMs,
  );
  const fracaoDecorrida = totalMs <= 0 ? 1 : decorridoMs / totalMs;
  const periodoEncerrado = agora.getTime() >= intervalo.fim.getTime();

  const fracaoRealizada = percentual ?? 0;
  const noRitmo = fracaoDecorrida === 0 ? true : fracaoRealizada >= fracaoDecorrida;

  if (periodoEncerrado) {
    // Fim do período sem bater o alvo → em_risco vira o veredito final.
    return { percentual, status: 'em_risco', noRitmo: false };
  }

  const status: StatusMeta =
    fracaoRealizada < fracaoDecorrida - MARGEM_RISCO ? 'em_risco' : 'no_caminho';
  return { percentual, status, noRitmo };
}
