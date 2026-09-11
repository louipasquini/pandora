/**
 * Itens de navegação do shell. Placeholders na spec 001 — cada módulo ganha suas
 * rotas reais nas próprias specs. A ordem segue a prioridade do dono do produto.
 */
export interface NavItem {
  label: string;
  to: string;
  /** Ainda não implementado (spec futura). */
  soon?: boolean;
  /**
   * Só aparece se as permissões efetivas do sujeito incluírem a permissão
   * (spec 004). Uma **lista** = basta ter **qualquer uma** (OU — spec 008).
   */
  requerPermissao?: string | string[];
}

/** `true` se o sujeito satisfaz `req` (string = exata; lista = qualquer uma). */
export function satisfazPermissao(
  req: string | string[] | undefined,
  permissoes: ReadonlySet<string>,
): boolean {
  if (req == null) return true;
  const alvos = Array.isArray(req) ? req : [req];
  return alvos.some((p) => permissoes.has(p));
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Visão geral', to: '/' },
  { label: 'Pessoas', to: '/pessoas', requerPermissao: 'pessoa:ver' },
  { label: 'Contas', to: '/contas', requerPermissao: 'conta:ver' },
  { label: 'Eventos', to: '/eventos', requerPermissao: 'evento:ver' },
  {
    label: 'CRM · Administração',
    to: '/crm/admin',
    requerPermissao: 'crm_admin:ver',
  },
  {
    label: 'CRM · Leads',
    to: '/crm/leads',
    requerPermissao: ['lead:ver_todos', 'lead:ver_proprios'],
  },
  {
    label: 'CRM · Segmentos',
    to: '/crm/segmentos',
    requerPermissao: 'segmento:ver',
  },
  {
    label: 'CRM · Pipelines',
    to: '/crm/pipelines',
    requerPermissao: ['oportunidade:ver_todas', 'oportunidade:ver_proprias'],
  },
  {
    label: 'CRM · WhatsApp',
    to: '/crm/whatsapp',
    requerPermissao: ['crm_admin:ver', 'whatsapp:ver'],
  },
  {
    label: 'CRM · Chat ao Vivo',
    to: '/crm/atendimentos',
    requerPermissao: ['atendimento:ver_todos', 'atendimento:ver_proprios'],
  },
  {
    label: 'CRM · Workflow',
    to: '/crm/workflow',
    requerPermissao: 'crm_admin:ver',
  },
  {
    label: 'CRM · Disparos',
    to: '/crm/disparos',
    requerPermissao: 'disparo:ver',
  },
  {
    label: 'CRM · Tarefas',
    to: '/crm/tarefas',
    requerPermissao: ['tarefa:ver_todas', 'tarefa:ver_proprias'],
  },
  {
    label: 'CRM · Dashboard',
    to: '/crm/dashboard',
    requerPermissao: 'dashboard:ver',
  },
  { label: 'CRM', to: '/crm', soon: true },
  {
    label: 'Financeiro · Transações',
    to: '/financeiro/transacoes',
    requerPermissao: 'transacao:ver',
  },
  {
    label: 'Financeiro · Contratos',
    to: '/contratos',
    requerPermissao: 'contrato:ver',
  },
  { label: 'Financeiro', to: '/financeiro', soon: true },
  { label: 'Catálogo · Produtos', to: '/produtos', requerPermissao: 'produto:ver' },
  { label: 'Catálogo · Ofertas', to: '/ofertas', requerPermissao: 'oferta:ver' },
  { label: 'Marketing', to: '/marketing', soon: true },
  { label: 'Central de Clientes', to: '/central', soon: true },
  { label: 'Administração', to: '/admin', requerPermissao: 'perfil:administrar' },
];
