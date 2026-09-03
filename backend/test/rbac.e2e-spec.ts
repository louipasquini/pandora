import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PERFIL_ADMIN_ID } from '../src/auth/auth.constants';
import { PERMISSOES } from '../src/auth/rbac/catalogo';
import { ProbeController } from './support/probe.controller';
import { authHeader, issueUserToken } from './support/auth';

/**
 * RBAC (spec 004) — e2e contra Postgres real (schema isolado + seed).
 * Cobre: guard 401/403/200, catálogo/efetivas/seed, CRUD de perfil + rbac_audit,
 * imutabilidade de sistema, atribuição a usuário, anti-lockout.
 */
describe('RBAC (e2e, Postgres real)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    // limpa tudo que os testes criam, preservando o perfil de sistema semeado
    await prisma.rbacAudit.deleteMany({});
    await prisma.usuarioPerfil.deleteMany({});
    await prisma.usuario.deleteMany({});
    await prisma.perfilPermissao.deleteMany({ where: { perfilId: { not: PERFIL_ADMIN_ID } } });
    await prisma.perfil.deleteMany({ where: { deSistema: false } });
  });

  const http = () => request(app.getHttpServer());
  const ADMIN = authHeader(); // sub = SERVICE_CLIENT_ID → administrador

  // Helpers: criam a entidade e limpam a auditoria de "criado" para os testes
  // poderem asseverar só sobre a ação sob teste.
  async function novoUsuario(nome = 'Ana', email = `ana+${Date.now()}-${Math.random()}@x.com`) {
    const res = await http().post('/admin/rbac/usuarios').set(ADMIN).send({ nome, email });
    expect(res.status).toBe(201);
    const id = res.body.id as string;
    await prisma.rbacAudit.deleteMany({ where: { entidadeId: id } });
    return id;
  }
  async function novoPerfil(nome: string, permissoes: string[]) {
    const res = await http()
      .post('/admin/rbac/perfis')
      .set(ADMIN)
      .send({ nome, permissoes });
    expect(res.status).toBe(201);
    const id = res.body.id as string;
    await prisma.rbacAudit.deleteMany({ where: { entidadeId: id } });
    return id;
  }

  // ------------------------------------------------------------- guard (US1)
  describe('guard por permissão', () => {
    it('/_probe/perm sem token → 401', async () => {
      const res = await http().get('/_probe/perm');
      expect(res.status).toBe(401);
    });

    it('/_probe/perm com token de serviço (admin) → 200', async () => {
      const res = await http().get('/_probe/perm').set(ADMIN);
      expect(res.status).toBe(200);
    });

    it('/_probe/perm com Usuario sem perfil → 403 genérico', async () => {
      const id = await novoUsuario();
      const res = await http().get('/_probe/perm').set(issueUserHeader(id));
      expect(res.status).toBe(403);
      const corpo = JSON.stringify(res.body);
      expect(corpo).not.toMatch(/stack|Error:|lead:ver_todos/i);
      expect(res.body.message).toBe('permissão insuficiente');
    });

    it('/_probe/perm com Usuario que tem lead:ver_todos → 200', async () => {
      const id = await novoUsuario();
      const perfilId = await novoPerfil('Vendas', ['lead:ver_todos']);
      await http()
        .put(`/admin/rbac/usuarios/${id}/perfis`)
        .set(ADMIN)
        .send({ perfilIds: [perfilId] })
        .expect(200);
      const res = await http().get('/_probe/perm').set(issueUserHeader(id));
      expect(res.status).toBe(200);
    });

    it('/_probe/sem-marcador com token válido → 403 (CL-03, fechado por omissão)', async () => {
      const res = await http().get('/_probe/sem-marcador').set(ADMIN);
      expect(res.status).toBe(403);
    });

    it('/_probe/autenticado com Usuario sem perfil → 200', async () => {
      const id = await novoUsuario();
      const res = await http().get('/_probe/autenticado').set(issueUserHeader(id));
      expect(res.status).toBe(200);
    });
  });

  // ------------------------------------------- catálogo / efetivas / seed (US2)
  describe('catálogo, permissões efetivas e seed', () => {
    it('GET /admin/rbac/permissoes com admin → catálogo agrupado', async () => {
      const res = await http().get('/admin/rbac/permissoes').set(ADMIN);
      expect(res.status).toBe(200);
      expect(res.body.recursos.map((r: { recurso: string }) => r.recurso)).toEqual([
        'perfil',
        'lead',
      ]);
    });

    it('GET /admin/rbac/permissoes com Usuario sem perfil → 403', async () => {
      const id = await novoUsuario();
      const res = await http().get('/admin/rbac/permissoes').set(issueUserHeader(id));
      expect(res.status).toBe(403);
    });

    it('GET /admin/rbac/permissoes sem token → 401', async () => {
      await http().get('/admin/rbac/permissoes').expect(401);
    });

    it('GET /auth/permissoes-efetivas: serviço → catálogo inteiro; Usuario sem perfil → []', async () => {
      const svc = await http().get('/auth/permissoes-efetivas').set(ADMIN);
      expect(svc.status).toBe(200);
      expect(svc.body.permissoes.sort()).toEqual(PERMISSOES.map((p) => p.id).sort());

      const id = await novoUsuario();
      const usr = await http().get('/auth/permissoes-efetivas').set(issueUserHeader(id));
      expect(usr.status).toBe(200);
      expect(usr.body.permissoes).toEqual([]);
    });

    it('o seed criou o perfil administrador (de_sistema) com o catálogo inteiro', async () => {
      const perfil = await prisma.perfil.findUnique({
        where: { id: PERFIL_ADMIN_ID },
        include: { permissoes: true },
      });
      expect(perfil?.deSistema).toBe(true);
      expect(perfil?.permissoes.map((p) => p.permissao).sort()).toEqual(
        PERMISSOES.map((p) => p.id).sort(),
      );
    });
  });

  // ----------------------------------------------- CRUD de perfil + auditoria (US3)
  describe('perfis e auditoria', () => {
    it('POST perfil válido → 201 + 1 rbac_audit "criado" com autor/quando', async () => {
      const res = await http()
        .post('/admin/rbac/perfis')
        .set(ADMIN)
        .send({ nome: 'Comercial', permissoes: ['lead:criar', 'lead:editar'] });
      expect(res.status).toBe(201);
      const audits = await prisma.rbacAudit.findMany({ where: { entidade: 'perfil' } });
      expect(audits).toHaveLength(1);
      expect(audits[0].campo).toBe('criado');
      expect(audits[0].autor).toBe(process.env.SERVICE_CLIENT_ID);
      expect(audits[0].quando).toBeInstanceOf(Date);
    });

    it('POST com permissão fora do catálogo → 400, 0 perfil, 0 auditoria', async () => {
      const res = await http()
        .post('/admin/rbac/perfis')
        .set(ADMIN)
        .send({ nome: 'X', permissoes: ['lead:fantasma'] });
      expect(res.status).toBe(400);
      expect(await prisma.perfil.count({ where: { deSistema: false } })).toBe(0);
      expect(await prisma.rbacAudit.count()).toBe(0);
    });

    it('POST nome já usado (outra caixa) → 409', async () => {
      await novoPerfil('Comercial', []);
      const res = await http()
        .post('/admin/rbac/perfis')
        .set(ADMIN)
        .send({ nome: 'COMERCIAL', permissoes: [] });
      expect(res.status).toBe(409);
    });

    it('PATCH renomear + trocar permissões → 200 + 2 registros', async () => {
      const id = await novoPerfil('Comercial', ['lead:criar']);
      const res = await http()
        .patch(`/admin/rbac/perfis/${id}`)
        .set(ADMIN)
        .send({ nome: 'Comercial Sr.', permissoes: ['lead:criar', 'lead:ver_todos'] });
      expect(res.status).toBe(200);
      const campos = (
        await prisma.rbacAudit.findMany({ where: { entidadeId: id }, orderBy: { quando: 'asc' } })
      ).map((a) => a.campo);
      expect(campos).toEqual(['renomeado', 'permissoes']);
    });

    it('PATCH salvando as MESMAS permissões → 0 registro de "permissoes"', async () => {
      const id = await novoPerfil('Comercial', ['lead:criar']);
      await http()
        .patch(`/admin/rbac/perfis/${id}`)
        .set(ADMIN)
        .send({ permissoes: ['lead:criar'] })
        .expect(200);
      expect(await prisma.rbacAudit.count({ where: { entidadeId: id } })).toBe(0);
    });

    it('PATCH e DELETE no administrador → 409, perfil intacto, 0 auditoria', async () => {
      await http()
        .patch(`/admin/rbac/perfis/${PERFIL_ADMIN_ID}`)
        .set(ADMIN)
        .send({ nome: 'Hackeado' })
        .expect(409);
      await http().delete(`/admin/rbac/perfis/${PERFIL_ADMIN_ID}`).set(ADMIN).expect(409);
      expect(await prisma.rbacAudit.count()).toBe(0);
      const p = await prisma.perfil.findUnique({ where: { id: PERFIL_ADMIN_ID } });
      expect(p?.nome).toBe('Administrador');
    });

    it('DELETE perfil com 1 usuário → 409 + totalUsuarios', async () => {
      const perfilId = await novoPerfil('Comercial', []);
      const usuarioId = await novoUsuario();
      await http()
        .put(`/admin/rbac/usuarios/${usuarioId}/perfis`)
        .set(ADMIN)
        .send({ perfilIds: [perfilId] })
        .expect(200);
      const res = await http().delete(`/admin/rbac/perfis/${perfilId}`).set(ADMIN);
      expect(res.status).toBe(409);
      expect(res.body.totalUsuarios).toBe(1);
    });

    it('DELETE perfil comum sem usuário → 204 + 1 rbac_audit "apagado"', async () => {
      const id = await novoPerfil('Descartável', ['lead:criar']);
      await http().delete(`/admin/rbac/perfis/${id}`).set(ADMIN).expect(204);
      const audits = await prisma.rbacAudit.findMany({ where: { entidadeId: id } });
      expect(audits.map((a) => a.campo)).toEqual(['apagado']);
    });

    it('qualquer rota de perfis com Usuario sem perfil:administrar → 403', async () => {
      const id = await novoUsuario();
      await http().get('/admin/rbac/perfis').set(issueUserHeader(id)).expect(403);
      await http()
        .post('/admin/rbac/perfis')
        .set(issueUserHeader(id))
        .send({ nome: 'Y', permissoes: [] })
        .expect(403);
    });

    it('perfil com permissão órfã → aparece em permissoesDesconhecidas, ignorada na resolução', async () => {
      const id = await novoPerfil('Legado', ['lead:criar']);
      await prisma.perfilPermissao.create({
        data: { perfilId: id, permissao: 'recurso_extinto:acao' },
      });
      const usuarioId = await novoUsuario();
      await http()
        .put(`/admin/rbac/usuarios/${usuarioId}/perfis`)
        .set(ADMIN)
        .send({ perfilIds: [id] })
        .expect(200);

      const lista = await http().get('/admin/rbac/perfis').set(ADMIN);
      const legado = lista.body.perfis.find((p: { id: string }) => p.id === id);
      expect(legado.permissoesDesconhecidas).toEqual(['recurso_extinto:acao']);

      const efetivas = await http()
        .get('/auth/permissoes-efetivas')
        .set(issueUserHeader(usuarioId));
      expect(efetivas.body.permissoes).toEqual(['lead:criar']);
    });
  });

  // --------------------------------------------------- usuários + atribuição (US4)
  describe('usuários e atribuição', () => {
    it('POST usuário válido → 201 + 1 rbac_audit "usuario/criado"', async () => {
      const res = await http()
        .post('/admin/rbac/usuarios')
        .set(ADMIN)
        .send({ nome: 'Ana', email: 'ana@x.com' });
      expect(res.status).toBe(201);
      const audits = await prisma.rbacAudit.findMany({ where: { entidade: 'usuario' } });
      expect(audits.map((a) => a.campo)).toEqual(['criado']);
    });

    it('POST e-mail repetido (outra caixa) → 409', async () => {
      await http()
        .post('/admin/rbac/usuarios')
        .set(ADMIN)
        .send({ nome: 'Ana', email: 'ana@x.com' })
        .expect(201);
      await http()
        .post('/admin/rbac/usuarios')
        .set(ADMIN)
        .send({ nome: 'Ana 2', email: 'ANA@X.COM' })
        .expect(409);
    });

    it('POST e-mail malformado → 400', async () => {
      await http()
        .post('/admin/rbac/usuarios')
        .set(ADMIN)
        .send({ nome: 'Ana', email: 'não-é-email' })
        .expect(400);
    });

    it('PUT 2 perfis → união em GET .../perfis e em permissoes-efetivas', async () => {
      const usuarioId = await novoUsuario();
      const p1 = await novoPerfil('P1', ['lead:criar']);
      const p2 = await novoPerfil('P2', ['lead:editar']);
      await http()
        .put(`/admin/rbac/usuarios/${usuarioId}/perfis`)
        .set(ADMIN)
        .send({ perfilIds: [p1, p2] })
        .expect(200);

      const perfis = await http().get(`/admin/rbac/usuarios/${usuarioId}/perfis`).set(ADMIN);
      expect(perfis.body.perfis.map((p: { id: string }) => p.id).sort()).toEqual([p1, p2].sort());

      const efetivas = await http()
        .get('/auth/permissoes-efetivas')
        .set(issueUserHeader(usuarioId));
      expect(efetivas.body.permissoes.sort()).toEqual(['lead:criar', 'lead:editar']);
    });

    it('PUT [] → 0 vínculos + rbac_audit "perfis" [...]→[]', async () => {
      const usuarioId = await novoUsuario();
      const p1 = await novoPerfil('P1', []);
      await http()
        .put(`/admin/rbac/usuarios/${usuarioId}/perfis`)
        .set(ADMIN)
        .send({ perfilIds: [p1] })
        .expect(200);
      await http()
        .put(`/admin/rbac/usuarios/${usuarioId}/perfis`)
        .set(ADMIN)
        .send({ perfilIds: [] })
        .expect(200);
      expect(await prisma.usuarioPerfil.count({ where: { usuarioId } })).toBe(0);
      const ultimo = await prisma.rbacAudit.findFirst({
        where: { entidadeId: usuarioId, campo: 'perfis' },
        orderBy: { quando: 'desc' },
      });
      expect(ultimo?.valorNovo).toEqual({ perfilIds: [] });
    });

    it('PUT com perfilId inexistente → 404, vínculos intactos', async () => {
      const usuarioId = await novoUsuario();
      const res = await http()
        .put(`/admin/rbac/usuarios/${usuarioId}/perfis`)
        .set(ADMIN)
        .send({ perfilIds: ['11111111-1111-7111-8111-111111111111'] });
      expect(res.status).toBe(404);
      expect(await prisma.usuarioPerfil.count({ where: { usuarioId } })).toBe(0);
    });

    it('PUT repetindo os perfis atuais → 0 registro de auditoria', async () => {
      const usuarioId = await novoUsuario();
      const p1 = await novoPerfil('P1', []);
      await http()
        .put(`/admin/rbac/usuarios/${usuarioId}/perfis`)
        .set(ADMIN)
        .send({ perfilIds: [p1] })
        .expect(200);
      await prisma.rbacAudit.deleteMany({ where: { entidadeId: usuarioId } });
      await http()
        .put(`/admin/rbac/usuarios/${usuarioId}/perfis`)
        .set(ADMIN)
        .send({ perfilIds: [p1] })
        .expect(200);
      expect(await prisma.rbacAudit.count({ where: { entidadeId: usuarioId } })).toBe(0);
    });

    it('PUT em usuário inexistente → 404', async () => {
      await http()
        .put('/admin/rbac/usuarios/11111111-1111-7111-8111-111111111111/perfis')
        .set(ADMIN)
        .send({ perfilIds: [] })
        .expect(404);
    });
  });

  // ------------------------------------------------------ anti-lockout (US4, SC-006)
  describe('anti-lockout', () => {
    it('nenhuma sequência zera os portadores de perfil:administrar', async () => {
      // remover perfil:administrar de perfis comuns e PUT [] no usuário não afeta
      // a credencial de serviço, que segue resolvendo o catálogo inteiro.
      const usuarioId = await novoUsuario();
      const p = await novoPerfil('QuaseAdmin', ['perfil:administrar']);
      await http()
        .put(`/admin/rbac/usuarios/${usuarioId}/perfis`)
        .set(ADMIN)
        .send({ perfilIds: [p] })
        .expect(200);
      // tira a permissão do perfil comum
      await http()
        .patch(`/admin/rbac/perfis/${p}`)
        .set(ADMIN)
        .send({ permissoes: [] })
        .expect(200);
      // esvazia o usuário
      await http()
        .put(`/admin/rbac/usuarios/${usuarioId}/perfis`)
        .set(ADMIN)
        .send({ perfilIds: [] })
        .expect(200);

      // a credencial de serviço ainda administra
      await http().get('/admin/rbac/perfis').set(ADMIN).expect(200);
    });
  });
});

function issueUserHeader(usuarioId: string): { Authorization: string } {
  return { Authorization: `Bearer ${issueUserToken(usuarioId)}` };
}
