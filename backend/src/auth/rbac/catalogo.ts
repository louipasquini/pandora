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
  // --- pessoa / conta (spec 005) ---
  {
    id: 'pessoa:ver',
    recurso: 'pessoa',
    rotulo: 'Ver pessoas (identidade, contatos, contas)',
  },
  { id: 'pessoa:editar', recurso: 'pessoa', rotulo: 'Criar e editar pessoas' },
  {
    id: 'pessoa:merge',
    recurso: 'pessoa',
    rotulo: 'Unificar pessoas e desfazer unificação',
  },
  {
    id: 'conta:ver',
    recurso: 'conta',
    rotulo: 'Ver contas (household / empresa)',
  },
  {
    id: 'conta:editar',
    recurso: 'conta',
    rotulo: 'Criar, editar contas e gerir membros',
  },
  {
    id: 'conta:merge',
    recurso: 'conta',
    rotulo: 'Unificar contas e desfazer unificação',
  },
  // --- evento_origem / worker de ingestão (spec 006) ---
  {
    id: 'evento:ver',
    recurso: 'evento',
    rotulo: 'Ver eventos de ingestão e o histórico de etapas',
  },
  {
    id: 'evento:reprocessar',
    recurso: 'evento',
    rotulo: 'Reprocessar eventos e rodar o worker de ingestão',
  },
  {
    id: 'evento:ingerir',
    recurso: 'evento',
    rotulo: 'Registrar eventos crus na ingestão',
  },
  // --- Administração do CRM (spec 007) ---
  {
    id: 'crm_admin:ver',
    recurso: 'crm_admin',
    rotulo: 'Ver a administração do CRM (equipes, expediente, integrações)',
  },
  {
    id: 'crm_admin:gerir_equipes',
    recurso: 'crm_admin',
    rotulo: 'Criar e editar equipes e gerir membros',
  },
  {
    id: 'crm_admin:gerir_expediente',
    recurso: 'crm_admin',
    rotulo: 'Configurar horários de atendimento e feriados',
  },
  {
    id: 'crm_admin:gerir_integracoes',
    recurso: 'crm_admin',
    rotulo: 'Cadastrar e rotacionar integrações',
  },
  // --- Campos personalizados de lead (spec 008) ---
  {
    id: 'crm_admin:gerir_campos_lead',
    recurso: 'crm_admin',
    rotulo: 'Gerir campos personalizados de lead',
  },
  // --- Timeline de interação, tag e segmento (spec 009) ---
  {
    id: 'interacao:registrar',
    recurso: 'interacao',
    rotulo: 'Registrar interações (WhatsApp, e-mail, ligação, ticket, nota, NPS)',
  },
  {
    id: 'interacao:gerir',
    recurso: 'interacao',
    rotulo: 'Editar e remover notas de outros autores',
  },
  {
    id: 'segmento:ver',
    recurso: 'segmento',
    rotulo: 'Ver segmentos e seus membros',
  },
  {
    id: 'segmento:gerir',
    recurso: 'segmento',
    rotulo: 'Criar, editar e excluir segmentos',
  },
  {
    id: 'crm_admin:gerir_tags',
    recurso: 'crm_admin',
    rotulo: 'Gerir o catálogo de tags (renomear, cor, ativar/desativar)',
  },
  // --- Pipeline / oportunidade (spec 010) ---
  { id: 'oportunidade:criar', recurso: 'oportunidade', rotulo: 'Criar oportunidades' },
  {
    id: 'oportunidade:editar',
    recurso: 'oportunidade',
    rotulo:
      'Editar oportunidades (título, valor, responsável, campos personalizados)',
  },
  {
    id: 'oportunidade:mover',
    recurso: 'oportunidade',
    rotulo: 'Mover oportunidades entre etapas',
  },
  {
    id: 'oportunidade:ver_todas',
    recurso: 'oportunidade',
    rotulo: 'Ver todas as oportunidades',
  },
  {
    id: 'oportunidade:ver_proprias',
    recurso: 'oportunidade',
    rotulo: 'Ver apenas as oportunidades do próprio responsável',
  },
  {
    id: 'crm_admin:gerir_pipelines',
    recurso: 'crm_admin',
    rotulo:
      'Gerir pipelines, etapas, atribuição automática e campos personalizados de oportunidade',
  },
  // --- Integração com WhatsApp (spec 011) ---
  {
    id: 'whatsapp:ver',
    recurso: 'whatsapp',
    rotulo: 'Ver canais, templates, janela de atendimento e status de opt-out de WhatsApp',
  },
  {
    id: 'whatsapp:enviar',
    recurso: 'whatsapp',
    rotulo: 'Enviar mensagens de WhatsApp em nome da empresa',
  },
  {
    id: 'whatsapp:gerir_optout',
    recurso: 'whatsapp',
    rotulo: 'Registrar e reverter opt-out de WhatsApp',
  },
  {
    id: 'crm_admin:gerir_whatsapp',
    recurso: 'crm_admin',
    rotulo: 'Configurar canal de WhatsApp e sincronizar templates',
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
