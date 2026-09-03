import { Controller, Get } from '@nestjs/common';

/**
 * Rota-isca só para e2e: um `GET` **sem** `@Public()`. Prova que uma rota nova,
 * sem nenhuma anotação de autenticação, nasce protegida pelo guard global
 * (SC-003). Nunca entra no bundle de produção.
 */
@Controller('_probe')
export class ProbeController {
  @Get('protegida')
  protegida(): { ok: true } {
    return { ok: true };
  }
}
