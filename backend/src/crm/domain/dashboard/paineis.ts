import { PERMISSAO_IDS } from '../../../auth/rbac/catalogo';

/**
 * Catálogo **fechado, no código** de painéis do dashboard do CRM (spec 017,
 * FR-001 / D-01 / research.md D-R2). Mesmo modelo do catálogo de permissões
 * (004) e de `ACAO_TIPOS` (014): cresce por PR revisável, nunca por escrita em
 * runtime. `assertCatalogoPaineisCoerente()` roda no boot do `CrmModule`.
 */

export type FormatoPainel = 'numero' | 'funil' | 'ranking' | 'tabela' | 'serie_temporal';

export interface PainelDef {
  readonly id: string;
  readonly titulo: string;
  readonly formato: FormatoPainel;
  /**
   * Lista de permissões RBAC das quais o sujeito precisa ter **ao menos uma**
   * para ver o painel (além de `dashboard:ver`, exigido para abrir a página).
   * Vazia = basta `dashboard:ver` (painel de "visão geral").
   */
  readonly permissoesAlternativas: readonly string[];
}

export const PAINEIS_DASHBOARD = Object.freeze([
  {
    id: 'visao_geral',
    titulo: 'Visão geral',
    formato: 'numero',
    permissoesAlternativas: [],
  },
  {
    id: 'funil_pipeline',
    titulo: 'Funil de conversão',
    formato: 'funil',
    permissoesAlternativas: ['oportunidade:ver_todas', 'oportunidade:ver_proprias'],
  },
  {
    id: 'ranking_comercial',
    titulo: 'Ranking do comercial',
    formato: 'ranking',
    permissoesAlternativas: ['oportunidade:ver_todas'],
  },
  {
    id: 'qualidade_atendimento',
    titulo: 'Qualidade do atendimento',
    formato: 'numero',
    permissoesAlternativas: ['atendimento:ver_todos', 'atendimento:ver_proprios'],
  },
  {
    id: 'leads_por_origem',
    titulo: 'Leads por origem',
    formato: 'tabela',
    permissoesAlternativas: ['lead:ver_todos', 'lead:ver_proprios'],
  },
  {
    id: 'serie_oportunidades',
    titulo: 'Oportunidades no tempo',
    formato: 'serie_temporal',
    permissoesAlternativas: ['oportunidade:ver_todas', 'oportunidade:ver_proprias'],
  },
] as const satisfies readonly PainelDef[]);

export type PainelId = (typeof PAINEIS_DASHBOARD)[number]['id'];

export const PAINEL_IDS: ReadonlySet<string> = new Set(PAINEIS_DASHBOARD.map((p) => p.id));

export function ehPainelConhecido(id: string): id is PainelId {
  return PAINEL_IDS.has(id);
}

export function painelPorId(id: string): PainelDef | undefined {
  return PAINEIS_DASHBOARD.find((p) => p.id === id);
}

/** Formatos que aceitam `?formato=csv` (FR-014). */
export function painelEhTabular(p: Pick<PainelDef, 'formato'>): boolean {
  return p.formato === 'tabela' || p.formato === 'ranking';
}

/**
 * `true` se o sujeito (conjunto de permissões efetivas) pode ver o painel:
 * tem `dashboard:ver` **e** (o painel não exige permissão específica **ou** o
 * sujeito tem ao menos uma das alternativas). D-03 / FR-006.
 */
export function painelVisivel(
  painel: PainelDef,
  permissoes: ReadonlySet<string>,
): boolean {
  if (!permissoes.has('dashboard:ver')) return false;
  if (painel.permissoesAlternativas.length === 0) return true;
  return painel.permissoesAlternativas.some((p) => permissoes.has(p));
}

export function paineisVisiveis(permissoes: ReadonlySet<string>): PainelDef[] {
  return PAINEIS_DASHBOARD.filter((p) => painelVisivel(p, permissoes));
}

/**
 * Coerência interna do catálogo — roda no boot. Qualquer inconsistência
 * **aborta** o processo (erro de código, não de dado). Mesmo padrão de
 * `assertCatalogoCoerente` (004).
 */
export function assertCatalogoPaineisCoerente(
  catalogo: readonly PainelDef[] = PAINEIS_DASHBOARD,
): void {
  const vistos = new Set<string>();
  for (const p of catalogo) {
    if (!/^[a-z][a-z0-9_]*$/.test(p.id)) {
      throw new Error(`catálogo de painéis: id fora do formato: ${JSON.stringify(p.id)}`);
    }
    if (vistos.has(p.id)) {
      throw new Error(`catálogo de painéis: id duplicado: ${JSON.stringify(p.id)}`);
    }
    vistos.add(p.id);
    for (const perm of p.permissoesAlternativas) {
      if (!PERMISSAO_IDS.has(perm)) {
        throw new Error(
          `catálogo de painéis: painel "${p.id}" referencia permissão fora do catálogo RBAC: ${JSON.stringify(perm)}`,
        );
      }
    }
  }
}
