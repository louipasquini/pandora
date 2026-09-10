import { ConfigService } from '@nestjs/config';
import { AsaasApiIndisponivelError } from './asaas-api-client.port';
import { AsaasApiClientHttp } from './asaas-api-client';

function cfg(vals: Record<string, string | undefined>): ConfigService {
  return { get: (k: string) => vals[k] } as unknown as ConfigService;
}

describe('AsaasApiClientHttp (spec 020 — fetch nativo, dublê)', () => {
  const original = global.fetch;
  afterEach(() => {
    global.fetch = original;
    jest.restoreAllMocks();
  });

  it('chave da conta ausente → AsaasApiIndisponivelError com o nome da conta', async () => {
    const c = new AsaasApiClientHttp(cfg({}) as never);
    await expect(
      c.listarPagamentos({ conta: 'ASAAS_PRD', offset: 0, limit: 100 }),
    ).rejects.toBeInstanceOf(AsaasApiIndisponivelError);
    await expect(
      c.listarPagamentos({ conta: 'ASAAS_PRD', offset: 0, limit: 100 }),
    ).rejects.toThrow(/ASAAS_PRD sem API/);
  });

  it('monta offset/limit/dateCreated e o header access_token; base default; hasMore', async () => {
    const spy = jest.fn(async (url: string | URL, _init?: RequestInit) => {
      const u = new URL(String(url));
      expect(u.origin + u.pathname).toBe('https://api.asaas.com/v3/payments');
      expect(u.searchParams.get('offset')).toBe('200');
      expect(u.searchParams.get('limit')).toBe('100');
      expect(u.searchParams.get('dateCreated[ge]')).toBe('2026-03-01');
      expect(u.searchParams.get('dateCreated[le]')).toBe('2026-03-31');
      return new Response(
        JSON.stringify({ hasMore: true, data: [{ id: 'pay_1' }, { id: 'pay_2' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    global.fetch = spy as unknown as typeof fetch;

    const c = new AsaasApiClientHttp(cfg({ ASAAS_PRD_API_KEY: 'k_prod' }) as never);
    const pag = await c.listarPagamentos({
      conta: 'ASAAS_PRD',
      offset: 200,
      limit: 100,
      dataInicio: '2026-03-01',
      dataFinal: '2026-03-31',
    });
    expect(pag.itens).toHaveLength(2);
    expect(pag.temProximaPagina).toBe(true);
    const init = spy.mock.calls[0][1] as RequestInit | undefined;
    const headers = init?.headers as Record<string, string>;
    expect(headers.access_token).toBe('k_prod');
    expect(headers.authorization).toBeUndefined();
  });

  it('usa ASAAS_<conta>_API_BASE_URL quando setado (sandbox)', async () => {
    const spy = jest.fn(async (url: string | URL) => {
      expect(String(url)).toContain('https://api-sandbox.asaas.com/v3/payments');
      return new Response(JSON.stringify({ hasMore: false, data: [] }), { status: 200 });
    });
    global.fetch = spy as unknown as typeof fetch;
    const c = new AsaasApiClientHttp(
      cfg({
        ASAAS_SVC_API_KEY: 'k_svc',
        ASAAS_SVC_API_BASE_URL: 'https://api-sandbox.asaas.com/v3',
      }) as never,
    );
    const pag = await c.listarPagamentos({ conta: 'ASAAS_SVC', offset: 0, limit: 50 });
    expect(pag.temProximaPagina).toBe(false);
  });

  it('HTTP não-2xx → lança Error com o status', async () => {
    global.fetch = (async () => new Response('erro', { status: 502 })) as never;
    const c = new AsaasApiClientHttp(cfg({ ASAAS_PRD_API_KEY: 'k' }) as never);
    await expect(
      c.listarPagamentos({ conta: 'ASAAS_PRD', offset: 0, limit: 100 }),
    ).rejects.toThrow(/HTTP 502/);
  });
});
