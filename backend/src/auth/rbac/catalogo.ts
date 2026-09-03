/**
 * Catálogo de permissões do RBAC (spec 004). **Fonte única, no código** — não é
 * tabela, não é editável em runtime, cresce por PR revisável a cada spec que
 * adiciona um recurso.
 *
 * Cada permissão: `id` estável `recurso:acao`, `recurso` de agrupamento (prefixo
 * do `id`), `rotulo` legível em pt-BR (o painel monta o checklist com ele).
 */

export interface PermissaoDef {
  readonly id: string;
  readonly recurso: string;
  readonly rotulo: string;
}

export const PERMISSOES = Object.freeze([
  {
    id: 'perfil:administrar',
    recurso: 'perfil',
    rotulo: 'Administrar perfis, permissões e atribuições de acesso',
  },
  { id: 'lead:criar', recurso: 'lead', rotulo: 'Criar leads' },
  { id: 'lead:editar', recurso: 'lead', rotulo: 'Editar leads' },
  { id: 'lead:ver_todos', recurso: 'lead', rotulo: 'Ver todos os leads' },
  {
    id: 'lead:ver_proprios',
    recurso: 'lead',
    rotulo: 'Ver apenas os próprios leads',
  },
] as const satisfies readonly PermissaoDef[]);

/** União literal dos ids de permissão conhecidos. */
export type Permissao = (typeof PERMISSOES)[number]['id'];

/** Conjunto dos ids do catálogo — verificação O(1) de "existe?". */
export const PERMISSAO_IDS: ReadonlySet<string> = new Set(
  PERMISSOES.map((p) => p.id),
);

/** `true` se `id` pertence ao catálogo atual. */
export function ehPermissaoConhecida(id: string): id is Permissao {
  return PERMISSAO_IDS.has(id);
}

const ID_RE = /^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$/;

/**
 * Verifica a coerência interna do catálogo. Roda no boot (`AuthModule`):
 * qualquer inconsistência **aborta** o processo — é erro de código, não de dado.
 */
export function assertCatalogoCoerente(
  catalogo: readonly PermissaoDef[] = PERMISSOES,
): void {
  const vistos = new Set<string>();
  for (const p of catalogo) {
    if (!ID_RE.test(p.id)) {
      throw new Error(
        `catálogo de permissões: id fora do formato "recurso:acao": ${JSON.stringify(p.id)}`,
      );
    }
    if (vistos.has(p.id)) {
      throw new Error(
        `catálogo de permissões: id duplicado: ${JSON.stringify(p.id)}`,
      );
    }
    vistos.add(p.id);
    const recursoDoId = p.id.slice(0, p.id.indexOf(':'));
    if (recursoDoId !== p.recurso) {
      throw new Error(
        `catálogo de permissões: recurso "${p.recurso}" não bate com o prefixo de "${p.id}"`,
      );
    }
  }
}

export interface RecursoAgrupado {
  recurso: string;
  permissoes: { id: string; rotulo: string }[];
}

/**
 * Catálogo agrupado por recurso, em ordem estável (recursos pela 1ª aparição;
 * permissões na ordem do catálogo). Formato que o `GET /admin/rbac/permissoes`
 * devolve e o painel consome.
 */
export function agruparPorRecurso(
  catalogo: readonly PermissaoDef[] = PERMISSOES,
): RecursoAgrupado[] {
  const ordem: string[] = [];
  const mapa = new Map<string, RecursoAgrupado>();
  for (const p of catalogo) {
    let grupo = mapa.get(p.recurso);
    if (!grupo) {
      grupo = { recurso: p.recurso, permissoes: [] };
      mapa.set(p.recurso, grupo);
      ordem.push(p.recurso);
    }
    grupo.permissoes.push({ id: p.id, rotulo: p.rotulo });
  }
  return ordem.map((r) => mapa.get(r)!);
}
