import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CONTEXT_MODULES } from '../src/app.context-modules';

describe('GET /health (e2e, Postgres real)', () => {
  describe('com banco conectado', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      app = moduleRef.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('responde 200 com status "ok" e db "up"', async () => {
      const res = await request(app.getHttpServer()).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.db).toBe('up');
      expect(typeof res.body.timestamp).toBe('string');
      expect(typeof res.body.uptimeSeconds).toBe('number');
    });

    it('lista exatamente os 11 bounded contexts', async () => {
      const res = await request(app.getHttpServer()).get('/health');
      expect([...res.body.contexts].sort()).toEqual([...CONTEXT_MODULES].sort());
      expect(res.body.contexts).toHaveLength(11);
    });
  });

  describe('com banco fora', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(PrismaService)
        .useValue({
          ping: async () => false,
          onModuleInit: async () => undefined,
          onModuleDestroy: async () => undefined,
          $connect: async () => undefined,
          $disconnect: async () => undefined,
        })
        .compile();
      app = moduleRef.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('responde 503 com status "degraded" e db "down", app ainda de pé', async () => {
      const res = await request(app.getHttpServer()).get('/health');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('degraded');
      expect(res.body.db).toBe('down');
      expect(res.body.contexts).toHaveLength(11);
    });
  });
});
