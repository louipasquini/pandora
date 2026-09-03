import { z } from 'zod';

export const papelSchema = z.enum(['LIDER', 'MEMBRO']);

export const adicionarMembroSchema = z
  .object({
    usuarioId: z.string().uuid(),
    papel: papelSchema.default('MEMBRO'),
  })
  .strict();
export type AdicionarMembroDto = z.infer<typeof adicionarMembroSchema>;

export const trocarPapelSchema = z.object({ papel: papelSchema }).strict();
export type TrocarPapelDto = z.infer<typeof trocarPapelSchema>;
