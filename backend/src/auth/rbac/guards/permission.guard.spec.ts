import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  AUTENTICADO_BASTA_KEY,
  IS_PUBLIC_KEY,
  PERM_METADATA_KEY,
} from '../../auth.constants';
import type { SujeitoRbacService } from '../sujeito-rbac.service';
import { PermissionGuard } from './permission.guard';

function ctx(path = '/x'): ExecutionContext {
  const handler = () => undefined;
  class Classe {}
  return {
    getHandler: () => handler,
    getClass: () => Classe,
    switchToHttp: () => ({ getRequest: () => ({ path, method: 'GET' }) }),
  } as unknown as ExecutionContext;
}

function guardCom(
  meta: Partial<Record<string, unknown>>,
  efetivas: string[] = [],
): PermissionGuard {
  const reflector = {
    getAllAndOverride: (key: string) => meta[key],
  } as unknown as Reflector;
  const sujeito = {
    permissoesDe: jest.fn().mockResolvedValue(new Set(efetivas)),
  } as unknown as SujeitoRbacService;
  return new PermissionGuard(reflector, sujeito);
}

describe('PermissionGuard (spec 004)', () => {
  it('@Public() → passa', async () => {
    await expect(guardCom({ [IS_PUBLIC_KEY]: true }).canActivate(ctx())).resolves.toBe(true);
  });

  it('rota /webhooks/* → passa', async () => {
    await expect(
      guardCom({}).canActivate(ctx('/webhooks/guru')),
    ).resolves.toBe(true);
  });

  it('@AutenticadoBasta() → passa', async () => {
    await expect(
      guardCom({ [AUTENTICADO_BASTA_KEY]: true }).canActivate(ctx()),
    ).resolves.toBe(true);
  });

  it('@RequerPermissao(a) com a nas efetivas → passa', async () => {
    await expect(
      guardCom({ [PERM_METADATA_KEY]: ['lead:criar'] }, ['lead:criar']).canActivate(ctx()),
    ).resolves.toBe(true);
  });

  it('@RequerPermissao(a,b) com só a → 403', async () => {
    await expect(
      guardCom({ [PERM_METADATA_KEY]: ['a', 'b'] }, ['a']).canActivate(ctx()),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('@RequerPermissao(a) com efetivas vazias → 403', async () => {
    await expect(
      guardCom({ [PERM_METADATA_KEY]: ['a'] }, []).canActivate(ctx()),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('sem nenhum marcador, rota não-pública → 403 (CL-03)', async () => {
    await expect(guardCom({}).canActivate(ctx())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('403 tem mensagem genérica (sem id da permissão)', async () => {
    try {
      await guardCom({ [PERM_METADATA_KEY]: ['lead:ver_todos'] }, []).canActivate(ctx());
      throw new Error('deveria ter lançado');
    } catch (e) {
      expect((e as ForbiddenException).message).toBe('permissão insuficiente');
      expect(JSON.stringify((e as ForbiddenException).getResponse())).not.toContain(
        'lead:ver_todos',
      );
    }
  });
});
