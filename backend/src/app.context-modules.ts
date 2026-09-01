/**
 * Os 11 bounded contexts da arquitetura-alvo (constituição, Princípio VI).
 * Fonte única: usada pelo `AppModule` (composição) e pelo `/health` (campo
 * `contexts`), garantindo que o health reflita a composição real (SC-002).
 */
export const CONTEXT_MODULES = [
  'core',
  'ingestao',
  'financeiro',
  'catalogo',
  'contratos',
  'clientes',
  'crm',
  'marketing',
  'central',
  'api',
  'admin',
] as const;

export type ContextName = (typeof CONTEXT_MODULES)[number];
