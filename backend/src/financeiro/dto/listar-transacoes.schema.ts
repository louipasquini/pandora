import {
  Classificacao,
  PlataformaOrigem,
  StatusTransacaoCanonico,
} from '@prisma/client';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

function csvEnum<T extends Record<string, string>>(e: T) {
  const validos = new Set(Object.values(e));
  return z
    .string()
    .optional()
    .transform((v): string[] | undefined => {
      if (!v || v.trim() === '') return undefined;
      const partes = v
        .split(',')
        .map((s) => s.trim())
        .filter((s) => validos.has(s));
      return partes.length > 0 ? partes : undefined;
    });
}

/**
 * Query de `GET /financeiro/transacoes`. Enum inválido / `tamanho` fora da faixa /
 * data não-ISO → 400 (o controller devolve `BadRequestException`).
 */
export const listarTransacoesSchema = z
  .object({
    plataformaOrigem: z.nativeEnum(PlataformaOrigem).optional(),
    statusCanonico: csvEnum(StatusTransacaoCanonico),
    classificacao: csvEnum(Classificacao),
    pagoDeFato: bool,
    pessoaId: z.string().uuid().optional(),
    precisaRevisao: bool,
    vinculoPendente: bool,
    ocorridoDe: z.coerce.date().optional(),
    ocorridoAte: z.coerce.date().optional(),
    q: z.string().trim().min(1).optional(),
    pagina: z.coerce.number().int().min(1).default(1),
    tamanho: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strip();

export type ListarTransacoesDto = z.infer<typeof listarTransacoesSchema>;
