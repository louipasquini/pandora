import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { AppConfig } from '../../core/config';
import type { AuthContext } from '../guards/jwt-auth.guard';
import { type Permissao } from './catalogo';
import { RbacRepository } from './rbac.repository';
import {
  resolverPermissoesEfetivas,
  todasAsPermissoes,
} from './resolver-permissoes';

/** Anexado a `req.rbac` na 1ª resolução da requisição (memoização). */
interface RbacRequestState {
  permissoes?: ReadonlySet<Permissao>;
}
type RequestComRbac = Request & {
  auth?: AuthContext;
  rbac?: RbacRequestState;
};

/**
 * Resolve as **permissões efetivas** do sujeito da requisição (CL-02: por
 * requisição, sem _staleness_, sem cache entre requisições). Memoiza em `req.rbac`.
 *
 * - `sub === SERVICE_CLIENT_ID` (credencial de serviço) → catálogo inteiro, sem
 *   tocar o banco (o único sujeito real hoje).
 * - `sub` que casa um `Usuario.id` → união das permissões dos perfis dele
 *   (perfil `administrador` → catálogo inteiro).
 * - `sub` desconhecido / usuário sem perfil → conjunto vazio.
 */
@Injectable()
export class SujeitoRbacService {
  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly repo: RbacRepository,
  ) {}

  async permissoesDe(reqRaw: Request): Promise<ReadonlySet<Permissao>> {
    const req = reqRaw as RequestComRbac;
    if (req.rbac?.permissoes) return req.rbac.permissoes;

    const sub = req.auth?.sub;
    const set = await this.resolver(sub);

    req.rbac = { ...(req.rbac ?? {}), permissoes: set };
    return set;
  }

  private async resolver(sub: string | undefined): Promise<ReadonlySet<Permissao>> {
    if (!sub) return new Set();

    const serviceClientId = this.config.get('SERVICE_CLIENT_ID', { infer: true });
    if (sub === serviceClientId) {
      return todasAsPermissoes();
    }

    const perfis = await this.repo.perfisDoUsuario(sub);
    return resolverPermissoesEfetivas(perfis);
  }
}
