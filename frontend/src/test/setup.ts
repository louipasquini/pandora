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
