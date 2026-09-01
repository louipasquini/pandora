import { z } from 'zod';
import { PLATAFORMAS_ORIGEM, PlataformaOrigem } from '../core/plataforma-origem.enum';

/**
 * Fonte de verdade tipada de TODA a configuração do backend (Padrão Transversal
 * "config/segredos: .env por conta"). O `.env.example` da raiz espelha estas chaves.
 *
 * `envSchema.parse(process.env)` roda no boot: se qualquer obrigatória faltar ou
 * estiver malformada, o processo aborta com o caminho da chave — NUNCA há default
 * silencioso para segredo ou string de conexão (FR-008).
 */

const pgUrl = z
  .string()
  .min(1)
  .refine((v) => /^postgres(ql)?:\/\//.test(v), {
    message: 'deve ser uma URL postgres:// (ou postgresql://)',
  });

/** As 3 chaves por conta de origem. Todas OPCIONAIS na spec 001. */
function accountKeys(prefix: string): z.ZodRawShape {
  return {
    [`${prefix}_API_BASE_URL`]: z.string().url().optional(),
    [`${prefix}_API_KEY`]: z.string().min(1).optional(),
    [`${prefix}_WEBHOOK_TOKEN`]: z.string().min(1).optional(),
  };
}

const accountsShape: z.ZodRawShape = PLATAFORMAS_ORIGEM.reduce<z.ZodRawShape>(
  (shape, conta) => Object.assign(shape, accountKeys(conta)),
  {},
);

export const envSchema = z
  .object({
    // --- Runtime ---
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535),

    // --- Banco ---
    DATABASE_URL: pgUrl,
    TEST_DATABASE_URL: pgUrl.optional(),

    // --- Autenticação de serviço (obrigatória de fato só a partir da spec 003) ---
    SERVICE_JWT_SECRET: z.string().min(32).optional(),
    SERVICE_CLIENT_ID: z.string().min(1).optional(),
    SERVICE_CLIENT_SECRET: z.string().min(16).optional(),

    // --- Contas de origem (7 blocos, 21 chaves, todas opcionais na 001) ---
    ...accountsShape,
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'test' && !env.TEST_DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['TEST_DATABASE_URL'],
        message: 'obrigatória quando NODE_ENV=test',
      });
    }
  });

export type AppConfig = z.infer<typeof envSchema>;

/** Agrupa as 3 chaves de uma conta de origem. Retorna `undefined` se nenhuma está setada. */
export function accountConfig(
  config: AppConfig,
  plataforma: PlataformaOrigem,
): { apiBaseUrl?: string; apiKey?: string; webhookToken?: string } | undefined {
  const rec = config as unknown as Record<string, string | undefined>;
  const apiBaseUrl = rec[`${plataforma}_API_BASE_URL`];
  const apiKey = rec[`${plataforma}_API_KEY`];
  const webhookToken = rec[`${plataforma}_WEBHOOK_TOKEN`];
  if (!apiBaseUrl && !apiKey && !webhookToken) return undefined;
  return { apiBaseUrl, apiKey, webhookToken };
}
