import {
  BadRequestException,
  Body,
  Controller,
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

/**
 * `POST /auth/token` — troca as credenciais de serviço por um JWT.
 * Público (não pode exigir o token que emite) e _rate-limited_ por IP.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

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
}
