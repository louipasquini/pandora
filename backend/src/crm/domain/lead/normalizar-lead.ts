/**
 * Normalização de borda do `lead` (spec 008). Puro, livre de locale, nunca lança.
 *
 * A normalização de contato é uma **duplicação mínima e deliberada** das funções
 * da spec 005 (research §2): o `core` ainda não expõe `normalizar`/DV de
 * documento, e o `crm` **não pode importar `src/clientes/**`** (Princípio VI). A
 * fonte de verdade da dedup segue sendo a 005 — a conversão manda os dados para
 * a `PortaIdentidade`, que re-normaliza. Aqui é só validação de entrada (422) e
 * consistência da linha de `lead`.
 *
 * A normalização de **tag** foi promovida para `crm/domain/tag/` na spec 009
 * (CL-04 — `tag` vira entidade de 1ª classe compartilhada); este módulo só
 * reexporta para não quebrar os imports existentes (`lead.service.ts`).
 */
import { normalizarTag, normalizarTags, type Norm } from '../tag/normalizar-tag';

export { normalizarTag, normalizarTags, type Norm };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function apenasDigitos(bruto: string): string {
  return (bruto ?? '').replace(/\D+/g, '');
}

export function normalizarNome(bruto: string | null | undefined): Norm {
  const v = (bruto ?? '').trim().replace(/\s+/g, ' ');
  if (!v) return { erro: 'vazio' };
  if (v.length > 160) return { erro: 'acima de 160 caracteres' };
  return { valor: v };
}

/** Slug curto de origem (`formulario_lp`, `importacao_csv`, …). Vazio → `null`. */
export function normalizarOrigem(bruto: string | null | undefined): string | null {
  const v = (bruto ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_.:-]/g, '');
  return v ? v.slice(0, 60) : null;
}

export function normalizarEmail(bruto: string | null | undefined): Norm {
  const v = (bruto ?? '').trim().toLowerCase();
  if (!v) return { erro: 'vazio' };
  if (!EMAIL_RE.test(v)) return { erro: 'forma inválida' };
  return { valor: v };
}

/** Telefone → E.164 mínimo; assume `+55` na borda quando 10–11 dígitos e sem `+`. */
export function normalizarTelefone(bruto: string | null | undefined): Norm {
  const cru = (bruto ?? '').trim();
  if (!cru) return { erro: 'vazio' };
  const temMais = cru.startsWith('+');
  let d = apenasDigitos(cru);
  if (!d) return { erro: 'sem dígitos' };
  if (!temMais && (d.length === 10 || d.length === 11)) d = `55${d}`;
  if (d.length < 12 || d.length > 13) return { erro: `comprimento ${d.length} implausível` };
  return { valor: `+${d}` };
}

function todosIguais(s: string): boolean {
  return s.length > 0 && /^(.)\1*$/.test(s);
}
function validarCpf(d: string): boolean {
  if (d.length !== 11 || todosIguais(d)) return false;
  const n = d.split('').map(Number);
  for (const passo of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < passo; i++) soma += n[i] * (passo + 1 - i);
    let dv = (soma * 10) % 11;
    if (dv === 10) dv = 0;
    if (dv !== n[passo]) return false;
  }
  return true;
}
function validarCnpj(d: string): boolean {
  if (d.length !== 14 || todosIguais(d)) return false;
  const n = d.split('').map(Number);
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const p2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (const pesos of [p1, p2]) {
    let soma = 0;
    for (let i = 0; i < pesos.length; i++) soma += n[i] * pesos[i];
    let dv = soma % 11;
    dv = dv < 2 ? 0 : 11 - dv;
    if (dv !== n[pesos.length]) return false;
  }
  return true;
}

/** Documento: só dígitos + DV de CPF (11) ou CNPJ (14). Inválido → erro. */
export function normalizarDocumento(bruto: string | null | undefined): Norm {
  const cru = (bruto ?? '').trim();
  if (!cru) return { erro: 'vazio' };
  const d = apenasDigitos(cru);
  if (d.length === 11 && validarCpf(d)) return { valor: d };
  if (d.length === 14 && validarCnpj(d)) return { valor: d };
  return { erro: 'DV inválido ou comprimento inesperado' };
}

