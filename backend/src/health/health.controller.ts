import { Controller, Get, HttpCode, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CONTEXT_MODULES } from '../app.context-modules';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/decorators/public.decorator';

interface HealthBody {
  status: 'ok' | 'degraded';
  db: 'up' | 'down';
  contexts: string[];
  uptimeSeconds: number;
  timestamp: string;
}

/**
 * `GET /health` — contrato em specs/001-bootstrap-projeto/contracts/health.md.
 * Público por design (probes). 200 só com `db up` e os 11 contextos compostos;
 * 503 `degraded` quando o banco não responde (a app segue de pé).
 */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @HttpCode(200)
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthBody> {
    const dbUp = await this.prisma.ping();
    const body: HealthBody = {
      status: dbUp ? 'ok' : 'degraded',
      db: dbUp ? 'up' : 'down',
      contexts: [...CONTEXT_MODULES],
      uptimeSeconds: Number(process.uptime().toFixed(2)),
      timestamp: new Date().toISOString(),
    };
    if (!dbUp) res.status(503);
    return body;
  }
}
