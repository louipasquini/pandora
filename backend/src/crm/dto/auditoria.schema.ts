import { z } from 'zod';

export const listarAuditoriaSchema = z
  .object({
    entidade: z
      .enum([
        'equipe',
        'equipe_membro',
        'janela_atendimento',
        'feriado',
        'integracao',
      ])
      .optional(),
    entidadeId: z.string().uuid().optional(),
    pagina: z.coerce.number().int().min(1).default(1),
    tamanho: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();
export type ListarAuditoriaDto = z.infer<typeof listarAuditoriaSchema>;
