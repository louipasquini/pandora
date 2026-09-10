import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthContext } from '../../../auth/guards/jwt-auth.guard';
import { SujeitoRbacService } from '../../../auth/rbac/sujeito-rbac.service';
import { EntidadeId } from '../../../core/core.module';
import { DashboardMetricaRepository } from '../../infra/dashboard';
import { MetaComercialService } from './meta.service';

function sub(req: Request): string | undefined {
  return (req as Request & { auth?: AuthContext }).auth?.sub;
}

const STATUS_ALERTA = new Set(['em_risco', 'batida', 'estourada']);

/**
 * "Minhas notificações" de meta (spec 017, FR-012 / CL-02) — só in-app, sem
 * envio externo (mesmo padrão de `NotificacaoService` de tarefa, 016). Metas do
 * sujeito (todas se `dashboard:gerir_metas`/`administrador`; senão as de
 * `responsavelId = sub` ∪ equipes do sujeito) em risco/batidas/estouradas no
 * período corrente.
 */
@Injectable()
export class MetaNotificacaoService {
  constructor(
    private readonly metas: MetaComercialService,
    private readonly rbac: SujeitoRbacService,
    private readonly metricas: DashboardMetricaRepository,
  ) {}

  async notificacoes(req: Request) {
    const perms = await this.rbac.permissoesDe(req);
    const vejoTodas = perms.has('dashboard:gerir_metas') || perms.has('perfil:administrar');

    const linhas = await this.metas.metasDoPeriodoCorrente();
    const sujeito = sub(req);
    const equipes =
      sujeito && EntidadeId.isValido(sujeito)
        ? new Set(await this.metricas.equipesDoUsuario(sujeito))
        : new Set<string>();

    const minhas = vejoTodas
      ? linhas
      : linhas.filter(
          (m) =>
            (m.responsavelId && m.responsavelId === sujeito) ||
            (m.equipeId && equipes.has(m.equipeId)),
        );

    const projetadas = await Promise.all(minhas.map((m) => this.metas.projetar(m)));
    return {
      itens: projetadas
        .filter((p) => STATUS_ALERTA.has(p.status))
        .map((p) => ({
          metaId: p.id,
          metrica: p.metrica,
          status: p.status,
          percentual: p.percentual,
          referencia: p.referencia,
        })),
    };
  }
}
