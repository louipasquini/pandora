import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from './decorators/public.decorator';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { AuthService, type TokenEmitido } from './auth.service';
import { tokenRequestSchema } from './dto/token-request.schema';
import { AutenticadoBasta } from './rbac/decorators/autenticado-basta.decorator';
import { SujeitoRbacService } from './rbac/sujeito-rbac.service';

/**
 * `POST /auth/token` — troca as credenciais de serviço por um JWT.
 * Público (não pode exigir o token que emite) e _rate-limited_ por IP.
 * `GET /auth/permissoes-efetivas` — permissões do sujeito atual (gate de UI).
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sujeito: SujeitoRbacService,
  ) {}

  @Public()
  @UseGuards(RateLimitGuard)
  @Post('token')
  @HttpCode(200)
  async token(@Body() body: unknown, @Req() req: Request): Promise<TokenEmitido> {
    const parsed = tokenRequestSchema.safeParse(body);
    if (!parsed.success) {
      // 400 (malformado) — distinto do 401 (credencial inválida). Sem eco do corpo.
      throw new BadRequestException('corpo inválido');
    }
    return this.auth.emitirToken(parsed.data.client_id, parsed.data.client_secret, req.ip);
  }

  @AutenticadoBasta()
  @Get('permissoes-efetivas')
  async permissoesEfetivas(@Req() req: Request): Promise<{ permissoes: string[] }> {
    const set = await this.sujeito.permissoesDe(req);
    return { permissoes: [...set].sort() };
  }
}
