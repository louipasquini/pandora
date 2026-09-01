import { join } from 'node:path';
import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { envSchema } from './env.schema';

/** `.env` fica na RAIZ do monorepo (não em backend/). */
const ROOT_ENV_FILE = join(__dirname, '../../../.env');

/**
 * Config global validada por zod. `validate` roda no boot; erro aborta o processo
 * com o caminho da variável (FR-008). Injete via `ConfigService<AppConfig, true>`.
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Seam de teste: PANDORA_IGNORE_ENV_FILE=1 força a config a vir só de process.env.
      ignoreEnvFile: process.env.PANDORA_IGNORE_ENV_FILE === '1',
      envFilePath: [ROOT_ENV_FILE],
      validate: (raw: Record<string, unknown>) => envSchema.parse(raw),
    }),
  ],
})
export class ConfigModule {}
