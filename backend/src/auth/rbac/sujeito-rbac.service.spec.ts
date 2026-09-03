import type { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { PERMISSOES } from './catalogo';
import { RbacRepository } from './rbac.repository';
import { SujeitoRbacService } from './sujeito-rbac.service';

function fakeConfig(serviceClientId: string): ConfigService<never, true> {
  return { get: () => serviceClientId } as unknown as ConfigService<never, true>;
}
function req(sub: string | undefined): Request {
  return { auth: sub ? { sub } : undefined } as unknown as Request;
}

describe('SujeitoRbacService (spec 004)', () => {
  it('credencial de serviço → catálogo inteiro, sem tocar o repo', async () => {
    const repo = { perfisDoUsuario: jest.fn() } as unknown as RbacRepository;
    const svc = new SujeitoRbacService(fakeConfig('pandora-panel'), repo);

    const set = await svc.permissoesDe(req('pandora-panel'));

    expect(set.size).toBe(PERMISSOES.length);
    expect(repo.perfisDoUsuario).not.toHaveBeenCalled();
  });

  it('usuário com 2 perfis → união das permissões', async () => {
    const repo = {
      perfisDoUsuario: jest.fn().mockResolvedValue([
        { id: 'p1', permissoes: ['lead:criar'] },
        { id: 'p2', permissoes: ['lead:editar', 'lead:criar'] },
      ]),
    } as unknown as RbacRepository;
    const svc = new SujeitoRbacService(fakeConfig('pandora-panel'), repo);

    const set = await svc.permissoesDe(req('usuario-123'));

    expect([...set].sort()).toEqual(['lead:criar', 'lead:editar']);
  });

  it('sub desconhecido / sem perfil → conjunto vazio', async () => {
    const repo = {
      perfisDoUsuario: jest.fn().mockResolvedValue([]),
    } as unknown as RbacRepository;
    const svc = new SujeitoRbacService(fakeConfig('pandora-panel'), repo);

    expect((await svc.permissoesDe(req('quem?'))).size).toBe(0);
    expect((await svc.permissoesDe(req(undefined))).size).toBe(0);
  });

  it('memoiza: 2ª chamada na mesma request não re-consulta o repo', async () => {
    const repo = {
      perfisDoUsuario: jest.fn().mockResolvedValue([{ id: 'p1', permissoes: ['lead:criar'] }]),
    } as unknown as RbacRepository;
    const svc = new SujeitoRbacService(fakeConfig('pandora-panel'), repo);
    const r = req('usuario-123');

    await svc.permissoesDe(r);
    await svc.permissoesDe(r);

    expect(repo.perfisDoUsuario).toHaveBeenCalledTimes(1);
  });
});
