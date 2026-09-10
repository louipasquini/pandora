import { ConfigService } from '@nestjs/config';
import { TmbApiIndisponivelError } from './tmb-api-client.port';
import { TmbApiClientHttp } from './tmb-api-client';

function cfg(vals: Record<string, string | undefined>): ConfigService {
  return { get: (k: string) => vals[k] } as unknown as ConfigService;
}

describe('TmbApiClientHttp (spec 019 — fetch nativo, dublê)', () => {
  const original = global.fetch;
  afterEach(() => {
    global.fetch = original;
    jest.restoreAllMocks();
  });

  it('env ausente → TmbApiIndisponivelError', async () => {
    const c = new TmbApiClientHttp(cfg({}) as never);
    await expect(
      c.listarPedidos({ pageNumber: 1, pageSize: 50 }),
    ).rejects.toBeInstanceOf(TmbApiIndisponivelError);
  });

  it('monta a query string e o Bearer; normaliza {itens}', async () => {
    const spy = jest.fn(async (url: string | URL, _init?: RequestInit) => {
      const u = new URL(String(url));
      expect(u.pathname).toBe('/api/pedidos');
      expect(u.searchParams.get('pageNumber')).toBe('2');
      expect(u.searchParams.get('pageSize')).toBe('7');
      expect(u.searchParams.get('data_inicio')).toBe('2026-03-01');
      expect(u.searchParams.get('produto_id')).toBe('44');
      return new Response(JSON.stringify({ itens: [{ pedido_id: 1 }, { pedido_id: 2 }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    global.fetch = spy as unknown as typeof fetch;

    const c = new TmbApiClientHttp(
      cfg({ TMB_API_BASE_URL: 'https://api.tmb.test', TMB_API_KEY: 'sk_x' }) as never,
    );
    const pagina = await c.listarPedidos({
      pageNumber: 2,
      pageSize: 7,
      dataInicio: '2026-03-01',
      produtoId: 44,
    });
    expect(pagina.itens).toHaveLength(2);
    expect(pagina.temProximaPagina).toBe(false); // 2 < 7
    const init = spy.mock.calls[0][1] as RequestInit | undefined;
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer sk_x');
  });

  it('HTTP não-2xx → lança Error com o status', async () => {
    global.fetch = (async () => new Response('erro', { status: 502 })) as never;
    const c = new TmbApiClientHttp(
      cfg({ TMB_API_BASE_URL: 'https://api.tmb.test', TMB_API_KEY: 'sk_x' }) as never,
    );
    await expect(c.listarPedidos({ pageNumber: 1, pageSize: 50 })).rejects.toThrow(/HTTP 502/);
  });
});
