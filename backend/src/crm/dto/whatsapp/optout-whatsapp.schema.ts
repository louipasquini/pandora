import { z } from 'zod';

export const optOutOrigemSchema = z.enum(['PROPRIO_NUMERO', 'ATENDENTE']);

export const registrarOptOutSchema = z
  .object({
    telefone: z.string().trim().min(1).max(40),
    origem: optOutOrigemSchema.default('ATENDENTE'),
    pessoaId: z.string().uuid().optional(),
    leadId: z.string().uuid().optional(),
  })
  .strict();
export type RegistrarOptOutDto = z.infer<typeof registrarOptOutSchema>;

export const reverterOptOutSchema = z
  .object({ telefone: z.string().trim().min(1).max(40) })
  .strict();
export type ReverterOptOutDto = z.infer<typeof reverterOptOutSchema>;

export const consultarOptOutQuerySchema = z
  .object({ telefone: z.string().trim().min(1).max(40) })
  .strict();
export type ConsultarOptOutQueryDto = z.infer<typeof consultarOptOutQuerySchema>;
