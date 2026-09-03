/**
 * Itens de navegação do shell. Placeholders na spec 001 — cada módulo ganha suas
 * rotas reais nas próprias specs. A ordem segue a prioridade do dono do produto.
 */
export interface NavItem {
  label: string;
  to: string;
  /** Ainda não implementado (spec futura). */
  soon?: boolean;
  /** Só aparece se as permissões efetivas do sujeito incluírem esta (spec 004). */
  requerPermissao?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Visão geral', to: '/' },
  { label: 'CRM', to: '/crm', soon: true },
  { label: 'Financeiro', to: '/financeiro', soon: true },
  { label: 'Marketing', to: '/marketing', soon: true },
  { label: 'Central de Clientes', to: '/central', soon: true },
  { label: 'Administração', to: '/admin', requerPermissao: 'perfil:administrar' },
];
