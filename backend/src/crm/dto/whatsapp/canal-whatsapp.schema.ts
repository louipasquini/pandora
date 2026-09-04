import { z } from 'zod';

export const criarCanalWhatsappSchema = z
  .object({
    nome: z.string().trim().min(1).max(120),
    numeroTelefone: z.string().trim().min(1).max(40),
    wabaId: z.string().trim().min(1).max(60),
    phoneNumberId: z.string().trim().min(1).max(60),
    accessToken: z.string().min(1).max(4096),
    appSecret: z.string().min(1).max(4096),
    webhookVerifyToken: z.string().min(1).max(4096),
    ativo: z.boolean().optional(),
  })
  .strict();
export type CriarCanalWhatsappDto = z.infer<typeof criarCanalWhatsappSchema>;

export const atualizarCanalWhatsappSchema = z
  .object({
    nome: z.string().trim().min(1).max(120).optional(),
    numeroTelefone: z.string().trim().min(1).max(40).optional(),
    ativo: z.boolean().optional(),
    accessToken: z.string().min(1).max(4096).optional(),
    appSecret: z.string().min(1).max(4096).optional(),
    webhookVerifyToken: z.string().min(1).max(4096).optional(),
  })
  .strict();
export type AtualizarCanalWhatsappDto = z.infer<typeof atualizarCanalWhatsappSchema>;

export const listarCanaisWhatsappSchema = z
  .object({
    pagina: z.coerce.number().int().min(1).default(1),
    tamanho: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();
export type ListarCanaisWhatsappDto = z.infer<typeof listarCanaisWhatsappSchema>;

export const templateWhatsappStatusSchema = z.enum([
  'PENDENTE',
  'APROVADO',
  'REJEITADO',
  'PAUSADO',
  'DESABILITADO',
]);
export const listarTemplatesWhatsappSchema = z
  .object({ statusAprovacao: templateWhatsappStatusSchema.optional() })
  .strict();
export type ListarTemplatesWhatsappDto = z.infer<typeof listarTemplatesWhatsappSchema>;
