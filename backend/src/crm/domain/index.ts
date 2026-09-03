/** Barrel do domínio puro do `crm` (spec 007). Sem NestJS, sem Prisma runtime. */
export * from './tipos';
export { estaEmExpediente } from './expediente';
export { cifrar, decifrar } from './cifra';
export { gerarApiKey, hashSegredo, API_KEY_PREFIXO } from './api-key';
export { mascararSegredo, ultimos4De } from './mascarar-segredo';
