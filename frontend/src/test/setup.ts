import '@testing-library/jest-dom/vitest';

/**
 * Shim de ambiente de teste (jsdom + Node/undici).
 *
 * O ambiente jsdom substitui `AbortController`/`AbortSignal` globais pelos da
 * própria implementação, mas deixa `Request` como o do Node (undici). O
 * react-router 7 cria um `Request` a cada navegação client-side e passa um
 * `signal`; a checagem de marca do undici rejeita o `AbortSignal` do jsdom com
 * "Expected signal to be an instance of AbortSignal".
 *
 * Nos testes não abortamos navegações, então basta descartar o `signal` na
 * construção do `Request`. Fora do teste (browser real) nada disto roda.
 */
const RequestOriginal = globalThis.Request;
class RequestSemSignal extends RequestOriginal {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    if (init && 'signal' in init) {
      const resto: RequestInit = { ...init };
      delete resto.signal;
      super(input, resto);
    } else {
      super(input, init);
    }
  }
}
globalThis.Request = RequestSemSignal as typeof Request;

/**
 * `fetch` padrão para os testes de componente (spec 004). Sem mock explícito,
 * qualquer chamada a `/auth/permissoes-efetivas` (o `AppShell` a faz para filtrar
 * a navegação) responde com o catálogo inteiro — o comportamento do sujeito
 * "administrador". Testes que precisam de outra resposta usam `vi.stubGlobal('fetch', ...)`.
 */
const TODAS_PERMISSOES = [
  'perfil:administrar',
  'lead:criar',
  'lead:editar',
  'lead:ver_todos',
  'lead:ver_proprios',
];
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = typeof input === 'string' ? input : input.toString();
  if (url.includes('/auth/permissoes-efetivas')) {
    return new Response(JSON.stringify({ permissoes: TODAS_PERMISSOES }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ message: `fetch não mockado: ${url}` }), {
    status: 599,
  });
}) as typeof fetch;
