import { z } from 'zod';

/**
 * Corpo de `POST /auth/token`. Validação estrutural mínima — a checagem de
 * corretude das credenciais é do `AuthService` (tempo constante, 401 genérico).
 * Falha aqui → 400 (malformado), distinto do 401.
 */
export const tokenRequestSchema = z
  .object({
    client_id: z.string().min(1),
    client_secret: z.string().min(1),
  })
  .strict();

export type TokenRequest = z.infer<typeof tokenRequestSchema>;
