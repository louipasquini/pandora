import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AppConfig } from '../core/config';
import { comparacaoConstante } from './crypto/comparacao-constante';

export interface TokenEmitido {
  access_token: string;
  token_type: 'Bearer';
  /** Segundos até expirar (= `SERVICE_JWT_TTL` resolvido). */
  expires_in: number;
}

/**
 * Emite o JWT de serviço a partir das credenciais de serviço. _Stateless_: nada
 * é persistido. A verificação do token é do `JwtAuthGuard`.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async emitirToken(
    clientId: string,
    clientSecret: string,
    ip?: string,
  ): Promise<TokenEmitido> {
    const idOk = comparacaoConstante(
      clientId,
      this.config.get('SERVICE_CLIENT_ID', { infer: true }),
    );
    const secretOk = comparacaoConstante(
      clientSecret,
      this.config.get('SERVICE_CLIENT_SECRET', { infer: true }),
    );

    // Avalia os dois antes de decidir — sem short-circuit — e responde genérico.
    if (!idOk || !secretOk) {
      this.logger.warn(`auth.token.fail ip=${ip ?? '?'}`);
      throw new UnauthorizedException('credenciais inválidas');
    }

    const expiresIn = this.config.get('SERVICE_JWT_TTL', { infer: true });
    const sub = this.config.get('SERVICE_CLIENT_ID', { infer: true });
    const access_token = await this.jwt.signAsync({}, { subject: sub });

    this.logger.log(`auth.token.ok sub=${sub} expires_in=${expiresIn}s`);
    return { access_token, token_type: 'Bearer', expires_in: expiresIn };
  }
}
