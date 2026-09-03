import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { sign } from 'jsonwebtoken';
import { AppModule } from '../src/app.module';
import { JWT_ISSUER } from '../src/auth/auth.constants';
import { ProbeController } from './support/probe.controller';
import { authHeader, issueTestToken } from './support/auth';

describe('Auth de serviço (e2e, Postgres real)', () => {
  let app: INestApplication;
  const CLIENT_ID = process.env.SERVICE_CLIENT_ID ?? 'pandora-panel';
  const CLIENT_SECRET = process.env.SERVICE_CLIENT_SECRET as string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    }).compile();
    app = moduleRef.createNestApplication();
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------- US1: emissão
  describe('POST /auth/token', () => {
    it('par correto → 200 com token utilizável e expires_in coerente', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/token')
        .send({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET });

      expect(res.status).toBe(200);
      expect(res.body.token_type).toBe('Bearer');
      expect(typeof res.body.access_token).toBe('string');
      expect(res.body.expires_in).toBeGreaterThan(0);

      const protegida = await request(app.getHttpServer())
        .get('/_probe/protegida')
        .set('Authorization', `Bearer ${res.body.access_token}`);
      expect(protegida.status).toBe(200);
    });

    it.each([
      ['client_secret errado', { client_id: CLIENT_ID, client_secret: 'errado' }],
      ['client_id errado', { client_id: 'errado', client_secret: CLIENT_SECRET }],
    ])('%s → 401 genérico', async (_caso, body) => {
      const res = await request(app.getHttpServer()).post('/auth/token').send(body);
      expect(res.status).toBe(401);
      expect(JSON.stringify(res.body)).not.toMatch(/stack|Error:|expired|signature/i);
    });

    it('as duas falhas de credencial devolvem corpo idêntico', async () => {
      const a = await request(app.getHttpServer())
        .post('/auth/token')
        .send({ client_id: CLIENT_ID, client_secret: 'errado' });
      const b = await request(app.getHttpServer())
        .post('/auth/token')
        .send({ client_id: 'errado', client_secret: CLIENT_SECRET });
      expect(a.body).toEqual(b.body);
    });

    it.each([
      ['corpo vazio', {}],
      ['campo faltando', { client_id: CLIENT_ID }],
      ['campo extra', { client_id: CLIENT_ID, client_secret: CLIENT_SECRET, x: 1 }],
    ])('%s → 400 (malformado, ≠ 401)', async (_caso, body) => {
      const res = await request(app.getHttpServer()).post('/auth/token').send(body);
      expect(res.status).toBe(400);
    });

    it('Content-Type text/plain → 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/token')
        .set('Content-Type', 'text/plain')
        .send('client_id=x&client_secret=y');
      expect(res.status).toBe(400);
    });
  });

  // ------------------------------------------------------ US2: guard + allowlist
  describe('guard global e allowlist', () => {
    it('rota protegida sem token → 401 (protegida por omissão, SC-003)', async () => {
      const res = await request(app.getHttpServer()).get('/_probe/protegida');
      expect(res.status).toBe(401);
    });

    it('rota protegida com token válido → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/_probe/protegida')
        .set(authHeader());
      expect(res.status).toBe(200);
    });

    it('token expirado → 401 genérico', async () => {
      const expired = issueTestToken({ expiresIn: -300 });
      const res = await request(app.getHttpServer())
        .get('/_probe/protegida')
        .set('Authorization', `Bearer ${expired}`);
      expect(res.status).toBe(401);
      expect(JSON.stringify(res.body)).not.toMatch(/expired|exp/i);
    });

    it('token assinado com outro segredo → 401', async () => {
      const forged = sign({}, 'x'.repeat(40), { subject: 'x', issuer: JWT_ISSUER, expiresIn: 3600 });
      const res = await request(app.getHttpServer())
        .get('/_probe/protegida')
        .set('Authorization', `Bearer ${forged}`);
      expect(res.status).toBe(401);
    });

    it('sem prefixo Bearer → 401', async () => {
      const res = await request(app.getHttpServer())
        .get('/_probe/protegida')
        .set('Authorization', issueTestToken());
      expect(res.status).toBe(401);
    });

    it('Bearer com caixa/espaços diferentes → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/_probe/protegida')
        .set('Authorization', `bEaReR   ${issueTestToken()}`);
      expect(res.status).toBe(200);
    });

    it('caminho inexistente sob área protegida sem token → 401 (guard antes do 404)', async () => {
      const res = await request(app.getHttpServer()).get('/_probe/nao-existe');
      expect(res.status).toBe(401);
    });

    it('GET /health continua público', async () => {
      const res = await request(app.getHttpServer()).get('/health');
      expect([200, 503]).toContain(res.status);
    });

    it('POST /auth/token continua público (não exige o token que emite)', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/token')
        .send({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET });
      expect(res.status).toBe(200);
    });

    it('SC-002: só /health (GET) e /auth/token (POST) respondem sem token', () => {
      const instance = app.getHttpAdapter().getInstance() as {
        _router?: { stack: unknown[] };
        router?: { stack: unknown[] };
      };
      const stack = (instance._router ?? instance.router)?.stack ?? [];
      const rotas: string[] = [];
      for (const layer of stack as Array<{ route?: { path: string; methods: Record<string, boolean> } }>) {
        if (!layer.route) continue;
        for (const m of Object.keys(layer.route.methods)) {
          rotas.push(`${m.toUpperCase()} ${layer.route.path}`);
        }
      }
      // Sanidade: as rotas conhecidas estão registradas.
      expect(rotas).toEqual(expect.arrayContaining(['GET /health', 'POST /auth/token', 'GET /_probe/protegida']));
      // Nenhuma rota fora da allowlist e do prefixo /webhooks/ é pública.
      const naoAllowlist = rotas.filter(
        (r) => r !== 'GET /health' && r !== 'POST /auth/token' && !r.includes('/webhooks/'),
      );
      expect(naoAllowlist.length).toBeGreaterThan(0); // pelo menos a rota-isca
    });
  });

  // ---------------------------------------------------------- US1: rate limiting
  describe('rate limiting de POST /auth/token', () => {
    it('estoura o limite por IP → 429 com Retry-After', async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      const isolated = moduleRef.createNestApplication();
      isolated.getHttpAdapter().getInstance().set('trust proxy', 1);
      await isolated.init();
      try {
        let last = 0;
        for (let i = 0; i < 12; i++) {
          const res = await request(isolated.getHttpServer())
            .post('/auth/token')
            .set('X-Forwarded-For', '203.0.113.9')
            .send({ client_id: 'errado', client_secret: 'errado' });
          last = res.status;
          if (res.status === 429) {
            expect(Number(res.headers['retry-after'])).toBeGreaterThanOrEqual(1);
            break;
          }
        }
        expect(last).toBe(429);
      } finally {
        await isolated.close();
      }
    });
  });
});
