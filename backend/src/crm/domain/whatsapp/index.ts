/** Barrel do domínio puro de `whatsapp` (spec 011). Sem NestJS, sem Prisma runtime. */
export { estaDentroDaJanela24h } from './janela-24h';
export { verificarAssinatura, compararTokenConstante } from './assinatura';
export {
  payloadWebhookSchema,
  mensagemWebhookSchema,
  statusWebhookSchema,
  contatoWebhookSchema,
  valorWebhookSchema,
  idMidiaDaMensagem,
  phoneNumberIdsDoPayload,
  TIPOS_CONTEUDO_MIDIA,
  type PayloadWebhook,
  type ValorWebhook,
  type MensagemWebhook,
  type StatusWebhook,
} from './payload-webhook.schema';
export { mapearStatusEntrega, mapearTipoConteudo } from './mapear-status-entrega';
