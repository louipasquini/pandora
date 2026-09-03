/**
 * Validação de dígito verificador de CPF/CNPJ e classificação por nº de dígitos.
 * Puro, sem dependência (research D1). Nunca lança.
 */

export type DocumentoTipo = 'CPF' | 'CNPJ';

export interface DocumentoClassificado {
  tipo: DocumentoTipo;
  /** só dígitos, validado. */
  digitos: string;
}

/** Extrai só os dígitos de uma string (remove máscara, espaços, etc.). */
export function apenasDigitos(bruto: string): string {
  return (bruto ?? '').replace(/\D+/g, '');
}

/** `true` se todos os caracteres são o mesmo dígito (ex.: `00000000000`). */
function todosIguais(s: string): boolean {
  return s.length > 0 && /^(.)\1*$/.test(s);
}

/** Valida o DV de um CPF (11 dígitos). */
export function validarCpf(digitos: string): boolean {
  if (digitos.length !== 11 || todosIguais(digitos)) return false;
  const nums = digitos.split('').map((d) => Number(d));
  for (const passo of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < passo; i++) {
      soma += nums[i] * (passo + 1 - i);
    }
    let dv = (soma * 10) % 11;
    if (dv === 10) dv = 0;
    if (dv !== nums[passo]) return false;
  }
  return true;
}

/** Valida o DV de um CNPJ (14 dígitos). */
export function validarCnpj(digitos: string): boolean {
  if (digitos.length !== 14 || todosIguais(digitos)) return false;
  const nums = digitos.split('').map((d) => Number(d));
  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (const pesos of [pesos1, pesos2]) {
    let soma = 0;
    for (let i = 0; i < pesos.length; i++) {
      soma += nums[i] * pesos[i];
    }
    const resto = soma % 11;
    const dv = resto < 2 ? 0 : 11 - resto;
    if (dv !== nums[pesos.length]) return false;
  }
  return true;
}

/**
 * Classifica um documento bruto: 11 dígitos → CPF (com DV), 14 → CNPJ (com DV).
 * Qualquer outra coisa (tamanho errado, DV inválido) → `null`.
 */
export function classificarDocumento(bruto: string): DocumentoClassificado | null {
  const d = apenasDigitos(bruto);
  if (d.length === 11 && validarCpf(d)) return { tipo: 'CPF', digitos: d };
  if (d.length === 14 && validarCnpj(d)) return { tipo: 'CNPJ', digitos: d };
  return null;
}
