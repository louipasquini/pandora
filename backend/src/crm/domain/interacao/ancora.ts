/**
 * Âncora de `interacao` (spec 009, CL-01): exatamente um de `pessoaId`/`leadId`.
 * Puro — validação de borda antes de tocar o banco (o `CHECK` da migração é a
 * rede de segurança final, não o caminho principal de erro).
 */

export type ResultadoAncora =
  | { ok: true; tipo: 'pessoa'; id: string }
  | { ok: true; tipo: 'lead'; id: string }
  | { ok: false; erro: 'ambos' | 'nenhum' };

export function validarAncora(entrada: {
  pessoaId?: string | null;
  leadId?: string | null;
}): ResultadoAncora {
  const temPessoa = entrada.pessoaId != null && entrada.pessoaId !== '';
  const temLead = entrada.leadId != null && entrada.leadId !== '';

  if (temPessoa && temLead) return { ok: false, erro: 'ambos' };
  if (!temPessoa && !temLead) return { ok: false, erro: 'nenhum' };
  if (temPessoa) return { ok: true, tipo: 'pessoa', id: entrada.pessoaId as string };
  return { ok: true, tipo: 'lead', id: entrada.leadId as string };
}
