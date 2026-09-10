import { ConfigService } from '@nestjs/config';
import { GuruApiIndisponivelError } from './guru-api-client.port';
import { GuruApiClientHttp } from './guru-api-client';

function cfg(vals: Record<string, string | undefined>): ConfigService {
  return { get: (k: string) => vals[k] } as unknown as ConfigService;
}

describe('GuruApiClientHttp (spec 021 — fetch nativo, cursor, dublê)', () => {
  const original = global.fetch;
  afterEach(() => {
    global.fetch = original;
    jest.restoreAllMocks();
  });

  it('chave da conta ausente → GuruApiIndisponivelError com o nome da conta', async () => {
    const c = new GuruApiClientHttp(cfg({}) as never);
    await expect(
      c.listarTransacoes({
        conta: 'GURU_PRD',
        dataInicio: '2026-03-01',
        dataFinal: '2026-03-31',
        campoData: 'ordered_at',
      }),
    ).rejects.toBeInstanceOf(GuruApiIndisponivelError);
  });

  it('monta <campoData>_ini/_end + header Authorization Bearer; base default; sem cursor na 1ª', async () => {
    const spy = jest.fn(async (url: string | URL, init?: RequestInit) => {
      const u = new URL(String(url));
      expect(u.origin + u.pathname).toBe(
        'https://digitalmanager.guru/api/v2/transactions',
      );
      expect(u.searchParams.get('ordered_at_ini')).toBe('2026-03-01');
      expect(u.searchParams.get('ordered_at_end')).toBe('2026-03-31');
      expect(u.searchParams.has('cursor')).toBe(false);
      expect((init?.headers as Record<string, string>).authorization).toBe(
        'Bearer tok_prd',
      );
      return new Response(
        JSON.stringify({ data: [{ id: 'tx_1' }], has_more_pages: 0, next_cursor: '' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    global.fetch = spy as unknown as typeof fetch;

    const c = new GuruApiClientHttp(cfg({ GURU_PRD_API_KEY: 'tok_prd' }) as never);
    const pag = await c.listarTransacoes({
      conta: 'GURU_PRD',
      dataInicio: '2026-03-01',
      dataFinal: '2026-03-31',
      campoData: 'ordered_at',
    });
    expect(pag.itens).toHaveLength(1);
    expect(pag.proximoCursor).toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('has_more_pages: 1 → proximoCursor = next_cursor; a chamada seguinte leva cursor', async () => {
    const chamadas: string[] = [];
    const spy = jest.fn(async (url: string | URL) => {
      const u = new URL(String(url));
      chamadas.push(u.searchParams.get('cursor') ?? '(inicio)');
      const primeira = chamadas.length === 1;
      return new Response(
        JSON.stringify({
          data: [{ id: primeira ? 'tx_1' : 'tx_2' }],
          has_more_pages: primeira ? 1 : 0,
          next_cursor: primeira ? 'CURSOR_2' : '',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    global.fetch = spy as unknown as typeof fetch;

    const c = new GuruApiClientHttp(cfg({ GURU_PRD_API_KEY: 'tok' }) as never);
    const p1 = await c.listarTransacoes({
      conta: 'GURU_PRD',
      dataInicio: '2026-01-01',
      dataFinal: '2026-01-31',
      campoData: 'ordered_at',
    });
    expect(p1.proximoCursor).toBe('CURSOR_2');
    const p2 = await c.listarTransacoes({
      conta: 'GURU_PRD',
      dataInicio: '2026-01-01',
      dataFinal: '2026-01-31',
      campoData: 'ordered_at',
      cursor: p1.proximoCursor,
    });
    expect(p2.proximoCursor).toBeUndefined();
    expect(chamadas).toEqual(['(inicio)', 'CURSOR_2']);
  });

  it('HTTP não-2xx → Error', async () => {
    global.fetch = (async () =>
      new Response('erro', { status: 500 })) as unknown as typeof fetch;
    const c = new GuruApiClientHttp(cfg({ GURU_PRD_API_KEY: 'tok' }) as never);
    await expect(
      c.listarTransacoes({
        conta: 'GURU_PRD',
        dataInicio: '2026-01-01',
        dataFinal: '2026-01-31',
        campoData: 'ordered_at',
      }),
    ).rejects.toThrow(/HTTP 500/);
  });
});
