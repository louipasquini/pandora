import { ConfigService } from '@nestjs/config';
import { HotmartApiIndisponivelError } from './hotmart-api-client.port';
import { HotmartApiClientHttp } from './hotmart-api-client';

function cfg(vals: Record<string, string | undefined>): ConfigService {
  return { get: (k: string) => vals[k] } as unknown as ConfigService;
}

const CREDS = {
  HOTMART_PRD_CLIENT_ID: 'cid',
  HOTMART_PRD_CLIENT_SECRET: 'csecret',
  HOTMART_PRD_API_KEY: 'basic-token',
};

const janela = { conta: 'HOTMART_PRD', dataInicio: '2026-06-01', dataFinal: '2026-06-30' } as const;

describe('HotmartApiClientHttp (spec 022 — OAuth2 + cursor, fetch nativo)', () => {
  const original = global.fetch;
  afterEach(() => {
    global.fetch = original;
    jest.restoreAllMocks();
  });

  it('credenciais ausentes → HotmartApiIndisponivelError', async () => {
    const c = new HotmartApiClientHttp(cfg({}) as never);
    await expect(c.listarVendas(janela)).rejects.toBeInstanceOf(HotmartApiIndisponivelError);
  });

  it('faz 1 POST de OAuth e reusa o token cacheado nas chamadas de dados', async () => {
    const chamadas: string[] = [];
    const spy = jest.fn(async (url: string | URL, init?: RequestInit) => {
      const u = new URL(String(url));
      chamadas.push(u.pathname);
      if (u.pathname.endsWith('/security/oauth/token')) {
        expect(init?.method).toBe('POST');
        expect((init?.headers as Record<string, string>).authorization).toBe('Basic basic-token');
        expect(u.searchParams.get('grant_type')).toBe('client_credentials');
        expect(u.searchParams.get('client_id')).toBe('cid');
        return new Response(JSON.stringify({ access_token: 'AT1', expires_in: 3600 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      // chamada de dados (history ou price/details)
      expect(u.origin + u.pathname).toMatch(
        /\/payments\/api\/v1\/sales\/(history|price\/details)$/,
      );
      expect((init?.headers as Record<string, string>).authorization).toBe('Bearer AT1');
      expect(u.searchParams.get('start_date')).toBe(String(Date.parse('2026-06-01T00:00:00Z')));
      expect(u.searchParams.get('end_date')).toBe(String(Date.parse('2026-06-30T23:59:59Z')));
      expect(u.searchParams.has('page_token')).toBe(false);
      return new Response(
        JSON.stringify({ items: [{ purchase: { transaction: 'HP1' } }], page_info: {} }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    global.fetch = spy as unknown as typeof fetch;

    const c = new HotmartApiClientHttp(cfg(CREDS) as never);
    await c.listarVendas(janela);
    await c.listarDetalhesPreco(janela);
    expect(chamadas.filter((p) => p.endsWith('/security/oauth/token'))).toHaveLength(1);
    expect(chamadas).toContain('/payments/api/v1/sales/price/details');
  });

  it('paginação por page_info.next_page_token; a chamada seguinte leva page_token', async () => {
    let n = 0;
    const cursores: Array<string | null> = [];
    const spy = jest.fn(async (url: string | URL) => {
      const u = new URL(String(url));
      if (u.pathname.endsWith('/security/oauth/token')) {
        return new Response(JSON.stringify({ access_token: 'AT', expires_in: 3600 }), { status: 200 });
      }
      cursores.push(u.searchParams.get('page_token'));
      n += 1;
      return new Response(
        JSON.stringify({
          items: [{ purchase: { transaction: `HP${n}` } }],
          page_info: n === 1 ? { next_page_token: 'PG2' } : {},
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    global.fetch = spy as unknown as typeof fetch;

    const c = new HotmartApiClientHttp(cfg(CREDS) as never);
    const p1 = await c.listarVendas(janela);
    expect(p1.proximoCursor).toBe('PG2');
    const p2 = await c.listarVendas({ ...janela, cursor: p1.proximoCursor });
    expect(p2.proximoCursor).toBeUndefined();
    expect(cursores).toEqual([null, 'PG2']);
  });

  it('transactionStatus vira query repetida transaction_status', async () => {
    const spy = jest.fn(async (url: string | URL) => {
      const u = new URL(String(url));
      if (u.pathname.endsWith('/security/oauth/token')) {
        return new Response(JSON.stringify({ access_token: 'AT', expires_in: 3600 }), { status: 200 });
      }
      expect(u.searchParams.getAll('transaction_status')).toEqual(['APPROVED', 'REFUNDED']);
      return new Response(JSON.stringify({ items: [], page_info: {} }), { status: 200 });
    });
    global.fetch = spy as unknown as typeof fetch;
    const c = new HotmartApiClientHttp(cfg(CREDS) as never);
    await c.listarVendas({ ...janela, transactionStatus: 'APPROVED, REFUNDED' });
  });

  it('HTTP não-2xx nos dados → Error', async () => {
    global.fetch = (async (url: string | URL) => {
      const u = new URL(String(url));
      if (u.pathname.endsWith('/security/oauth/token')) {
        return new Response(JSON.stringify({ access_token: 'AT', expires_in: 3600 }), { status: 200 });
      }
      return new Response('erro', { status: 502 });
    }) as unknown as typeof fetch;
    const c = new HotmartApiClientHttp(cfg(CREDS) as never);
    await expect(c.listarVendas(janela)).rejects.toThrow(/HTTP 502/);
  });
});
