import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Carrega o .env da raiz do monorepo em process.env (sem sobrescrever o que já existe). */
function loadRootEnv(): void {
  const path = join(__dirname, '../../.env');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    if (process.env[key] === undefined) process.env[key] = t.slice(eq + 1).trim();
  }
}

/**
 * globalSetup do Jest e2e. Roda UMA vez, ANTES dos workers serem forkados —
 * então a mutação de `process.env` aqui é herdada por todos eles.
 *
 * Isola cada EXECUÇÃO da suíte num schema Postgres próprio (`t_<...>`) dentro do
 * banco de teste, aplica as migrações e aponta `DATABASE_URL` para lá. Duas
 * execuções concorrentes nunca colidem (SC-004). O schema é destruído no
 * teardown-db.ts.
 */
export default function setupDb(): void {
  loadRootEnv();
  // Worker de ingestão (spec 006): nunca roda o laço de fundo nos e2e — os testes
  // disparam passadas explícitas por `POST /ingestao/eventos/processar`.
  process.env.INGESTAO_WORKER_ENABLED = 'false';
  // Worker do Workflow do CRM (spec 014): mesma disciplina — os e2e disparam
  // passadas explícitas por `POST /crm/workflow/processar`.
  process.env.CRM_WORKFLOW_WORKER_ENABLED = 'false';
  // Worker de Disparos do CRM (spec 015): mesma disciplina — os e2e disparam
  // passadas explícitas por `POST /crm/disparos/processar`.
  process.env.CRM_DISPAROS_WORKER_ENABLED = 'false';
  // Administração do CRM (spec 007): fixture da chave de cifra de segredo de
  // integração (base64 de 32 bytes) — obrigatória no boot; usa a do .env se houver.
  if (!process.env.CRM_INTEGRACAO_CIFRA_KEY) {
    process.env.CRM_INTEGRACAO_CIFRA_KEY =
      '5+QVNu/w2yAj7wkHW4Kq+6bG9v3RE3+rurMCorQFnR0=';
  }
  // Adapter TMB (spec 019): fixture do token de webhook — sem ele o
  // `WebhookAuthenticator` recusa `POST /webhooks/tmb/*` com 401. Usa o do .env
  // se houver; o helper `test/support/tmb.ts` lê o mesmo valor.
  if (!process.env.TMB_WEBHOOK_TOKEN) {
    process.env.TMB_WEBHOOK_TOKEN = 'tmb-webhook-token-e2e';
  }
  // Adapter Asaas (spec 020): fixtures dos tokens de webhook por conta — sem eles
  // o `WebhookAuthenticator` recusa `POST /webhooks/asaas/{prd,svc}` com 401.
  // `test/support/asaas.ts` lê os mesmos valores.
  if (!process.env.ASAAS_PRD_WEBHOOK_TOKEN) {
    process.env.ASAAS_PRD_WEBHOOK_TOKEN = 'asaas-prd-webhook-token-e2e';
  }
  if (!process.env.ASAAS_SVC_WEBHOOK_TOKEN) {
    process.env.ASAAS_SVC_WEBHOOK_TOKEN = 'asaas-svc-webhook-token-e2e';
  }
  // Adapter Guru (spec 021): fixtures dos tokens de webhook por conta — a Guru
  // envia o token no campo `api_token` do corpo; sem eles o `WebhookAuthenticator`
  // recusa `POST /webhooks/guru/{prd,svc}` com 401. `test/support/guru.ts` lê os
  // mesmos valores.
  if (!process.env.GURU_PRD_WEBHOOK_TOKEN) {
    process.env.GURU_PRD_WEBHOOK_TOKEN = 'guru-prd-webhook-token-e2e';
  }
  if (!process.env.GURU_SVC_WEBHOOK_TOKEN) {
    process.env.GURU_SVC_WEBHOOK_TOKEN = 'guru-svc-webhook-token-e2e';
  }
  const base = process.env.TEST_DATABASE_URL;
  if (!base) {
    throw new Error(
      'TEST_DATABASE_URL ausente: configure o banco de teste (ver README, seção "Como rodar").',
    );
  }

  const schema = `t_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`;
  const url = new URL(base);
  url.searchParams.set('schema', schema);
  const databaseUrl = url.toString();

  // Aplica as migrações no schema recém-nomeado (o Prisma cria o schema).
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  // Seed idempotente (spec 004) — cria o perfil de sistema `administrador`.
  execFileSync('npx', ['prisma', 'db', 'seed'], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  process.env.DATABASE_URL = databaseUrl;
  process.env.PANDORA_TEST_SCHEMA = schema;
  process.env.PANDORA_TEST_BASE_URL = base;

  process.stdout.write(`\n[test] schema isolado: ${schema}\n`);
}
