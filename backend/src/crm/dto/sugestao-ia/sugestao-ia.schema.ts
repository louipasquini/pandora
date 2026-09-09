import { z } from 'zod';

export const gerarSugestaoSchema = z
  .object({ interacaoId: z.string().uuid() })
  .strict();
export type GerarSugestaoDto = z.infer<typeof gerarSugestaoSchema>;

export const aceitarSugestaoSchema = z
  .object({ conteudoFinal: z.string().trim().min(1).max(4000).optional() })
  .strict();
export type AceitarSugestaoDto = z.infer<typeof aceitarSugestaoSchema>;

export const feedbackSugestaoSchema = z.object({ util: z.boolean() }).strict();
export type FeedbackSugestaoDto = z.infer<typeof feedbackSugestaoSchema>;

export const listarSugestoesSchema = z
  .object({ interacaoId: z.string().uuid().optional() })
  .strict();
export type ListarSugestoesDto = z.infer<typeof listarSugestoesSchema>;
