import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Cliente Prisma como serviço injetável. Conexão preguiçosa: `onModuleInit`
 * tenta conectar mas NÃO derruba o boot se o banco estiver fora — o `/health`
 * reporta `db: "down"` (edge case "PostgreSQL indisponível ao subir").
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
    } catch (err) {
      this.logger.warn(
        `Não foi possível conectar ao banco no boot: ${(err as Error).message}. ` +
          'A aplicação segue de pé; /health reportará db: "down".',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** `true` se um `SELECT 1` responde. Usado pelo /health. */
  async ping(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
