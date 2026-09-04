/**
 * Regras puras da conversão Lead → Pessoa (spec 008, US4). Sem I/O.
 * A escrita real em `pessoa` acontece no serviço, via a `PortaIdentidade` do
 * `core` — nunca aqui, nunca com import de `clientes`.
 */
import type { DadosIdentidadeLead } from '../../../core/core.module';
import type { LeadStatus } from './tipos';

export type PodeConverter =
  | { ok: true }
  | { ok: false; erro: 'lead_descartado' | 'ja_convertido' };

/** Só `status = ATIVO` converte. `DESCARTADO` → 409; `CONVERTIDO` → no-op. */
export function podeConverter(lead: { status: LeadStatus }): PodeConverter {
  if (lead.status === 'ATIVO') return { ok: true };
  if (lead.status === 'CONVERTIDO') return { ok: false, erro: 'ja_convertido' };
  return { ok: false, erro: 'lead_descartado' };
}

/** Mapeia a linha de `lead` para o shape que a `PortaIdentidade` espera. */
export function montarDadosIdentidade(lead: {
  nome: string;
  email: string | null;
  telefone: string | null;
  documento: string | null;
}): DadosIdentidadeLead {
  return {
    nome: lead.nome,
    email: lead.email,
    telefone: lead.telefone,
    documento: lead.documento,
  };
}
