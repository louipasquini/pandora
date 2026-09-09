/**
 * Resolução de destinatários de um disparo (spec 015, FR-004) — pura, sem
 * banco. Dedup por telefone normalizado entre a origem "segmento" e a origem
 * "CSV importado" (e dentro do próprio CSV, já que cada fonte pode conter
 * repetição): o mesmo telefone nunca aparece 2x na lista resolvida,
 * independente de quantas fontes o trazem (research.md D-R3 do plan.md
 * cobre por que isso vira `mensagem_disparo`, não `mensagem_whatsapp`).
 */
export interface DestinatarioBruto {
  telefone: string;
  pessoaId?: string | null;
  leadId?: string | null;
  nome?: string | null;
}

export interface DestinatarioResolvido {
  telefone: string;
  pessoaId: string | null;
  leadId: string | null;
}

export interface FontesDestinatarios {
  segmento?: DestinatarioBruto[];
  csv?: DestinatarioBruto[];
}

/**
 * Segmento entra primeiro (fonte "de verdade" do CRM); CSV só complementa
 * quando o telefone ainda não apareceu. Telefones vazios/`null` são
 * descartados aqui (nunca deveriam chegar — são filtrados na origem).
 */
export function resolverDestinatarios(fontes: FontesDestinatarios): DestinatarioResolvido[] {
  const vistos = new Map<string, DestinatarioResolvido>();

  for (const grupo of [fontes.segmento ?? [], fontes.csv ?? []]) {
    for (const item of grupo) {
      const telefone = (item.telefone ?? '').trim();
      if (!telefone || vistos.has(telefone)) continue;
      vistos.set(telefone, {
        telefone,
        pessoaId: item.pessoaId ?? null,
        leadId: item.leadId ?? null,
      });
    }
  }

  return [...vistos.values()];
}
