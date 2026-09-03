import { z } from 'zod';
import { PLATAFORMAS_ORIGEM, PlataformaOrigem } from '../core/plataforma-origem.enum';
import { duracaoParaSegundos } from '../core/tempo/duracao';

/** Teto rígido do TTL do JWT de serviço: 24 h (FR-005 da spec 003). */
const TTL_MAX_SEGUNDOS = 86_400;

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

    // --- Autenticação de serviço (OBRIGATÓRIA a partir da spec 003, em todo NODE_ENV) ---
    SERVICE_JWT_SECRET: z.string().min(32),
    SERVICE_CLIENT_ID: z.string().min(1),
    SERVICE_CLIENT_SECRET: z.string().min(16),
    /**
     * TTL do token de acesso. Forma compacta `<n>[s|m|h|d]`; default 12 h.
     * Convertido para SEGUNDOS aqui, com teto rígido de 24 h — valor acima
     * aborta o boot nomeando `SERVICE_JWT_TTL` (FR-005).
     */
    SERVICE_JWT_TTL: z
      .string()
      .regex(/^\d+[smhd]$/, 'use <n>[s|m|h|d], ex.: "12h"')
      .default('12h')
      .transform((v, ctx): number => {
        const seg = duracaoParaSegundos(v);
        if (seg > TTL_MAX_SEGUNDOS) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `máximo 24h (${TTL_MAX_SEGUNDOS}s); recebido ${seg}s`,
          });
          return z.NEVER;
        }
        return seg;
      }),

    // --- HTTP da API interna (spec 003) ---
    /** Origem única do painel autorizada por CORS. */
    CORS_ORIGIN: z.string().url().default('http://localhost:5174'),
    /** Rate limiting leve de `POST /auth/token` (janela fixa por IP). */
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),

    // --- Worker de ingestão (spec 006) ---
    /** Liga o laço de fundo do worker. Desligado em teste (setup-db.ts força `false`). */
    INGESTAO_WORKER_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    /** Intervalo entre passadas do worker, em ms. */
    INGESTAO_WORKER_INTERVALO_MS: z.coerce.number().int().min(250).default(5_000),
    /** Tentativas de uma etapa em `erro` antes de virar `erro` terminal (CL-05). */
    INGESTAO_WORKER_MAX_TENTATIVAS: z.coerce.number().int().min(1).default(3),
    /** Máximo de eventos processados por passada. */
    INGESTAO_WORKER_LOTE: z.coerce.number().int().min(1).default(50),

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
