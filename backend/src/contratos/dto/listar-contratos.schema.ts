import { StatusContratoCanonico } from '@prisma/client';
import { z } from 'zod';

/**
 * Query de `GET /contratos`. Enum inválido / `tamanho` fora da faixa → `400`
 * (o controller devolve `BadRequestException`).
 */
export const listarContratosSchema = z
  .object({
    produtoCodigo: z.string().trim().min(1).optional(),
    pessoaId: z.string().uuid().optional(),
    turma: z.string().trim().min(1).optional(),
    status: z.nativeEnum(StatusContratoCanonico).optional(),
    pagina: z.coerce.number().int().min(1).default(1),
    tamanho: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strip();

export type ListarContratosDto = z.infer<typeof listarContratosSchema>;
