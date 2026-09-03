import type { OpcoesExpediente } from './tipos';

/**
 * `estaEmExpediente` (spec 007) — função **pura e determinística**, livre do `TZ`
 * do processo. Converte `instante` para a hora local de **America/Sao_Paulo** via
 * `Intl` nativo (0 dependência) e responde se cai no expediente.
 *
 * Regras (spec §Clarifications CL-01..CL-04 + `contracts/estaEmExpediente.md`):
 *  - "Aplicável" = entradas globais (`equipeId === null`) ∪ entradas da `equipe`
 *    informada **se ela estiver ativa** (CL-01 — união, nunca override).
 *  - Feriado aplicável cuja data bate → `false`, **mesmo** dentro de uma janela.
 *  - Feriado `recorrenteAnual` casa por `(mês, dia)` exato; 29/02 não desloca
 *    para 28/02 (CL-04).
 *  - `true` sse a hora local cai em **alguma** janela ativa aplicável
 *    (`inicio <= t < fim` — início inclusivo, fim exclusivo).
 *  - Sem janela aplicável → `false` (nunca "aberto por omissão").
 *  - Equipe inativa → só as entradas globais valem.
 */

const FUSO = 'America/Sao_Paulo';

const FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

interface HoraLocal {
  ano: number;
  mes: number; // 1–12
  dia: number; // 1–31
  diaSemana: number; // 0 = domingo … 6 = sábado
  minutosDoDia: number; // 0–1439
}

function paraHoraLocal(instante: Date): HoraLocal {
  const partes = FMT.formatToParts(instante);
  const get = (t: string): number =>
    Number(partes.find((p) => p.type === t)?.value ?? '0');

  const ano = get('year');
  const mes = get('month');
  const dia = get('day');
  let hora = get('hour');
  if (hora === 24) hora = 0; // alguns runtimes emitem "24" à meia-noite
  const minuto = get('minute');

  // Dia da semana: trata a data local Y/M/D como uma data UTC só para extrair o
  // getUTCDay() — imune ao fuso do processo.
  const diaSemana = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();

  return { ano, mes, dia, diaSemana, minutosDoDia: hora * 60 + minuto };
}

export function estaEmExpediente(instante: Date, opcoes: OpcoesExpediente): boolean {
  const { ano, mes, dia, diaSemana, minutosDoDia } = paraHoraLocal(instante);

  const equipeAtivaId =
    opcoes.equipe && opcoes.equipe.ativo ? opcoes.equipe.id : null;
  const aplicavel = (equipeId: string | null): boolean =>
    equipeId === null || equipeId === equipeAtivaId;

  // Feriado subtrai — mesmo dentro de uma janela.
  const emFeriado = opcoes.feriados.some((f) => {
    if (!aplicavel(f.equipeId)) return false;
    if (f.recorrenteAnual) return f.mes === mes && f.dia === dia;
    return f.mes === mes && f.dia === dia && f.ano === ano;
  });
  if (emFeriado) return false;

  return opcoes.janelas.some(
    (j) =>
      j.ativo &&
      aplicavel(j.equipeId) &&
      j.diaSemana === diaSemana &&
      j.inicioMin <= minutosDoDia &&
      minutosDoDia < j.fimMin,
  );
}
