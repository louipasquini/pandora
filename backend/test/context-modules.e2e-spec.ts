import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CONTEXT_MODULES } from '../src/app.context-modules';

/**
 * US2 / SC-002: os 11 contextos da constituição têm módulo isolado e são
 * compostos com sucesso — provado pela app subir e o /health listá-los.
 */
describe('composição dos bounded contexts (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('a aplicação inicializa com todos os módulos de contexto', () => {
    expect(app).toBeDefined();
  });

  it('/health reflete os 11 contextos reais', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect([...res.body.contexts].sort()).toEqual([...CONTEXT_MODULES].sort());
  });

  it('a lista canônica tem exatamente os nomes esperados', () => {
    expect([...CONTEXT_MODULES].sort()).toEqual(
      [
        'admin',
        'api',
        'catalogo',
        'central',
        'clientes',
        'contratos',
        'core',
        'crm',
        'financeiro',
        'ingestao',
        'marketing',
      ].sort(),
    );
  });
});
