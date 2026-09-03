/**
 * Normalização de borda das chaves de dedup (research D1/D2). Cada função devolve
 * `{ valor }` ou `{ descartada: motivo }` — **nunca lança**. Livre de locale.
 */
import { apenasDigitos, classificarDocumento } from './documento';
import type { DocumentoTipo } from './documento';

export type Normalizacao<T = string> =
  | { valor: T; descartada?: undefined }
  | { valor?: undefined; descartada: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * E-mail: `trim` + `lowercase` + forma mínima. **Sem** heurística por provedor
 * (não remove `+tag` nem pontos) — decisão research D2.
 */
export function normalizarEmail(bruto: string | null | undefined): Normalizacao {
  const v = (bruto ?? '').trim().toLowerCase();
  if (!v) return { descartada: 'vazio' };
  if (!EMAIL_RE.test(v)) return { descartada: 'forma inválida' };
  return { valor: v };
}

/**
 * Telefone → E.164 mínimo. Só dígitos; se vier sem DDI e tiver 10–11 dígitos,
 * assume BR (`+55`) **só aqui, na borda** (research D1). Fora de 10–13 dígitos
 * após tirar não-dígitos → descartado.
 */
export function normalizarTelefone(
  bruto: string | null | undefined,
): Normalizacao {
  const cru = (bruto ?? '').trim();
  if (!cru) return { descartada: 'vazio' };
  const temMais = cru.startsWith('+');
  let d = apenasDigitos(cru);
  if (!d) return { descartada: 'sem dígitos' };

  if (!temMais && (d.length === 10 || d.length === 11)) {
    d = `55${d}`;
  }
  if (d.length < 12 || d.length > 13) {
    return { descartada: `comprimento ${d.length} fora de E.164 plausível` };
  }
  return { valor: `+${d}` };
}

export interface DocumentoNormalizado {
  tipo: DocumentoTipo;
  valor: string;
}

/** Documento: classifica CPF/CNPJ por nº de dígitos + DV. Inválido → descartado. */
export function normalizarDocumento(
  bruto: string | null | undefined,
): Normalizacao<DocumentoNormalizado> {
  const cru = (bruto ?? '').trim();
  if (!cru) return { descartada: 'vazio' };
  const c = classificarDocumento(cru);
  if (!c) return { descartada: 'DV inválido ou comprimento inesperado' };
  return { valor: { tipo: c.tipo, valor: c.digitos } };
}

/**
 * Normaliza `DadosIdentidade` em chaves de dedup. Chave inválida vira `undefined`
 * (não entra como critério) e o motivo vai para `descartadas` (log de quem chama).
 */
export interface ChavesIdentidade {
  documento?: string;
  cnpj?: string;
  email?: string;
  telefone?: string;
  descartadas: { campo: string; motivo: string }[];
}

export function normalizarChaves(dados: {
  documento?: string | null;
  email?: string | null;
  telefone?: string | null;
}): ChavesIdentidade {
  const out: ChavesIdentidade = { descartadas: [] };

  if (dados.documento != null && `${dados.documento}`.trim() !== '') {
    const r = normalizarDocumento(dados.documento);
    if (r.descartada != null) {
      out.descartadas.push({ campo: 'documento', motivo: r.descartada });
    } else if (r.valor.tipo === 'CPF') {
      out.documento = r.valor.valor;
    } else {
      out.cnpj = r.valor.valor;
    }
  }
  if (dados.email != null && `${dados.email}`.trim() !== '') {
    const r = normalizarEmail(dados.email);
    if (r.descartada != null) {
      out.descartadas.push({ campo: 'email', motivo: r.descartada });
    } else {
      out.email = r.valor;
    }
  }
  if (dados.telefone != null && `${dados.telefone}`.trim() !== '') {
    const r = normalizarTelefone(dados.telefone);
    if (r.descartada != null) {
      out.descartadas.push({ campo: 'telefone', motivo: r.descartada });
    } else {
      out.telefone = r.valor;
    }
  }
  return out;
}
