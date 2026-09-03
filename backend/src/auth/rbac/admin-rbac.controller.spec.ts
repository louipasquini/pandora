import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminRbacController } from './admin-rbac.controller';
import type { RbacRepository } from './rbac.repository';
import type { RbacAuditService } from './rbac-audit.service';

const req = { auth: { sub: 'pandora-panel' } } as unknown as Request;

function make(repoOverrides: Partial<RbacRepository>) {
  const audit = { registrar: jest.fn().mockResolvedValue(undefined) } as unknown as RbacAuditService;
  const repo = {
    perfilPorNomeNormalizado: jest.fn().mockResolvedValue(null),
    perfilDetalhe: jest.fn(),
    criarPerfil: jest.fn(),
    usuarioPorEmailNormalizado: jest.fn().mockResolvedValue(null),
    usuarioPorId: jest.fn(),
    criarUsuario: jest.fn(),
    perfilIdsExistentes: jest.fn(),
    perfisDoUsuarioIds: jest.fn(),
    perfisDoUsuarioComNome: jest.fn().mockResolvedValue([]),
    ...repoOverrides,
  } as unknown as RbacRepository;
  return { ctrl: new AdminRbacController(repo, audit), audit, repo };
}

describe('AdminRbacController (spec 004, unit)', () => {
  it('GET /permissoes devolve o catálogo agrupado, ordem estável', () => {
    const { ctrl } = make({});
    const out = ctrl.permissoes();
    // ordem estável: perfil e lead vêm primeiro (spec 004); specs seguintes
    // acrescentam recursos no fim (spec 005: pessoa, conta).
    expect(out.recursos.slice(0, 2).map((r) => r.recurso)).toEqual([
      'perfil',
      'lead',
    ]);
    expect(out.recursos[1].permissoes[0].id).toBe('lead:criar');
  });

  it('POST /perfis com permissão fora do catálogo → 400, não persiste', async () => {
    const { ctrl, repo } = make({});
    await expect(
      ctrl.criarPerfil({ nome: 'X', permissoes: ['lead:inventada'] }, req),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.criarPerfil).not.toHaveBeenCalled();
  });

  it('POST /perfis com nome já usado → 409', async () => {
    const { ctrl } = make({
      perfilPorNomeNormalizado: jest.fn().mockResolvedValue({ id: 'outro' }),
    });
    await expect(
      ctrl.criarPerfil({ nome: 'Comercial', permissoes: [] }, req),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('PATCH em perfil de sistema → 409, sem auditoria', async () => {
    const { ctrl, audit } = make({
      perfilDetalhe: jest.fn().mockResolvedValue({
        id: 'a',
        nome: 'Administrador',
        deSistema: true,
        permissoes: [],
        permissoesDesconhecidas: [],
        totalUsuarios: 0,
      }),
    });
    await expect(
      ctrl.editarPerfil('a', { nome: 'Outro' }, req),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(audit.registrar).not.toHaveBeenCalled();
  });

  it('DELETE em perfil com usuários → 409 com totalUsuarios', async () => {
    const { ctrl } = make({
      perfilDetalhe: jest.fn().mockResolvedValue({
        id: 'a',
        nome: 'Comercial',
        deSistema: false,
        permissoes: [],
        permissoesDesconhecidas: [],
        totalUsuarios: 3,
      }),
    });
    await expect(ctrl.apagarPerfil('a', req)).rejects.toMatchObject({
      response: { totalUsuarios: 3 },
    });
  });

  it('POST /usuarios com e-mail repetido (outra caixa) → 409', async () => {
    const { ctrl } = make({
      usuarioPorEmailNormalizado: jest.fn().mockResolvedValue({ id: 'u1' }),
    });
    await expect(
      ctrl.criarUsuario({ nome: 'Ana', email: 'ANA@x.com' }, req),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('PUT /usuarios/:id/perfis com perfilId inexistente → 404', async () => {
    const { ctrl } = make({
      usuarioPorId: jest.fn().mockResolvedValue({ id: 'u1' }),
      perfilIdsExistentes: jest.fn().mockResolvedValue(new Set()),
    });
    await expect(
      ctrl.setPerfisDoUsuario(
        'u1',
        { perfilIds: ['11111111-1111-7111-8111-111111111111'] },
        req,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
