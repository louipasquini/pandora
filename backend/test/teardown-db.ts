import { Client } from 'pg';

/**
 * globalTeardown do Jest e2e. Roda no mesmo processo principal do setup-db.ts,
 * então lê o nome do schema de `process.env`. Destrói o schema isolado.
 */
export default async function teardownDb(): Promise<void> {
  const schema = process.env.PANDORA_TEST_SCHEMA;
  const base = process.env.PANDORA_TEST_BASE_URL;
  if (!schema || !base) return;

  const client = new Client({ connectionString: base });
  try {
    await client.connect();
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    process.stdout.write(`\n[test] schema removido: ${schema}\n`);
  } finally {
    await client.end();
  }
}
