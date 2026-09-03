import { z } from 'zod';

export const criarUsuarioSchema = z.object({
  nome: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
});
export type CriarUsuarioDto = z.infer<typeof criarUsuarioSchema>;

export const putPerfisSchema = z.object({
  perfilIds: z.array(z.string().uuid()).transform((arr) => [...new Set(arr)]),
});
export type PutPerfisDto = z.infer<typeof putPerfisSchema>;

/** Forma canônica para dedup/uniqueness de e-mail. */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Forma canônica para dedup/uniqueness de nome de perfil. */
export function normalizarNome(nome: string): string {
  return nome.trim().toLowerCase();
}
