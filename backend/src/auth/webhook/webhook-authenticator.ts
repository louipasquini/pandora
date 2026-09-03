import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../core/config';
import { PlataformaOrigem } from '../../core/plataforma-origem.enum';
import { comparacaoConstante } from '../crypto/comparacao-constante';

export type ResultadoWebhookAuth =
  | { autenticado: true; conta: PlataformaOrigem }
  | {
      autenticado: false;
      motivo: 'sem_token_configurado' | 'token_invalido' | 'token_ausente';
    };

/**
 * Autenticação de webhook por conta de origem — **separada** do JWT de serviço
 * (não usa `SERVICE_JWT_SECRET`, não passa pelo `JwtAuthGuard`).
 *
 * Nenhuma rota `/webhooks/*` existe nesta spec; as specs 019–022 injetam este
 * serviço nos seus controllers e extraem o token do header que cada plataforma
 * usar antes de chamar `autenticar`.
 */
@Injectable()
export class WebhookAuthenticator {
  private readonly logger = new Logger(WebhookAuthenticator.name);

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  autenticar(
    conta: PlataformaOrigem,
    tokenCandidato: string | undefined,
  ): ResultadoWebhookAuth {
    // As chaves `<CONTA>_WEBHOOK_TOKEN` entram no schema por spread tipado como
    // `ZodRawShape`, então não aparecem no tipo estático de `AppConfig` (mesmo
    // motivo do cast em `accountConfig`). Leitura destipada e deliberada:
    const chave = `${conta}_WEBHOOK_TOKEN`;
    const esperado = (this.config as unknown as ConfigService).get<string>(chave);

    if (!esperado) {
      this.logger.warn(`webhook.auth.reject conta=${conta} motivo=sem_token_configurado`);
      return { autenticado: false, motivo: 'sem_token_configurado' };
    }
    if (!tokenCandidato) {
      this.logger.warn(`webhook.auth.reject conta=${conta} motivo=token_ausente`);
      return { autenticado: false, motivo: 'token_ausente' };
    }
    if (!comparacaoConstante(tokenCandidato, esperado)) {
      this.logger.warn(`webhook.auth.reject conta=${conta} motivo=token_invalido`);
      return { autenticado: false, motivo: 'token_invalido' };
    }
    return { autenticado: true, conta };
  }
}
