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
  'pessoa:ver',
  'pessoa:editar',
  'pessoa:merge',
  'conta:ver',
  'conta:editar',
  'conta:merge',
  'evento:ver',
  'evento:reprocessar',
  'evento:ingerir',
  'crm_admin:ver',
  'crm_admin:gerir_equipes',
  'crm_admin:gerir_expediente',
  'crm_admin:gerir_integracoes',
  'crm_admin:gerir_campos_lead',
  'crm_admin:gerir_tags',
  'interacao:registrar',
  'interacao:gerir',
  'segmento:ver',
  'segmento:gerir',
  'oportunidade:criar',
  'oportunidade:editar',
  'oportunidade:mover',
  'oportunidade:ver_todas',
  'oportunidade:ver_proprias',
  'crm_admin:gerir_pipelines',
  'whatsapp:ver',
  'whatsapp:enviar',
  'whatsapp:gerir_optout',
  'crm_admin:gerir_whatsapp',
];
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = typeof input === 'string' ? input : input.toString();
  if (url.includes('/auth/permissoes-efetivas')) {
    return new Response(JSON.stringify({ permissoes: TODAS_PERMISSOES }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  // spec 005: listas vazias por padrão (testes específicos usam vi.stubGlobal)
  if (/\/pessoas(\?|$)/.test(url) || /\/contas(\?|$)/.test(url)) {
    return new Response(
      JSON.stringify({ itens: [], pagina: 1, tamanho: 25, total: 0 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  // spec 006: painel de eventos vazio por padrão
  if (/\/ingestao\/eventos(\?|$)/.test(url)) {
    return new Response(
      JSON.stringify({ itens: [], pagina: 1, tamanho: 25, total: 0 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  // spec 007: Administração do CRM — coleções vazias / expediente fechado por padrão
  if (/\/crm\/admin\/expediente(\?|$)/.test(url)) {
    return new Response(
      JSON.stringify({ emExpediente: false, instante: new Date().toISOString(), equipeId: null }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (/\/crm\/admin\/(janelas-atendimento|feriados)(\?|$)/.test(url)) {
    return new Response(JSON.stringify({ itens: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (/\/crm\/admin\/(equipes|integracoes)(\?|$)/.test(url)) {
    return new Response(
      JSON.stringify({ itens: [], pagina: 1, tamanho: 25, total: 0 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  // spec 008: Leads — lista/auditoria vazias, definições de campo vazias
  if (/\/crm\/leads\/[^/]+\/auditoria(\?|$)/.test(url)) {
    return new Response(
      JSON.stringify({ itens: [], pagina: 1, tamanho: 25, total: 0 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (/\/crm\/leads(\?|$)/.test(url)) {
    return new Response(
      JSON.stringify({ itens: [], pagina: 1, tamanho: 25, total: 0 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (/\/crm\/admin\/campos-lead(\?|$)/.test(url)) {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  // spec 009: timeline/tags/segmentos — vazios por padrão
  if (/\/crm\/(pessoas|leads)\/[^/]+\/interacoes(\?|$)/.test(url)) {
    return new Response(
      JSON.stringify({ itens: [], pagina: 1, tamanho: 25, total: 0 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (/\/crm\/(pessoas|leads|interacoes)\/[^/]+\/tags(\?|$)/.test(url)) {
    return new Response(JSON.stringify({ tags: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (/\/crm\/tags(\?|$)/.test(url)) {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (/\/crm\/segmentos\/[^/]+\/membros(\?|$)/.test(url)) {
    return new Response(
      JSON.stringify({ itens: [], pagina: 1, tamanho: 25, total: 0 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (/\/crm\/segmentos(\?|$)/.test(url)) {
    return new Response(
      JSON.stringify({ itens: [], pagina: 1, tamanho: 25, total: 0 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  // spec 010: pipeline/oportunidade — coleções vazias por padrão
  if (/\/crm\/pipelines\/[^/]+\/etapas(\?|$)/.test(url)) {
    return new Response(JSON.stringify({ itens: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (/\/crm\/pipelines\/[^/]+\/metricas(\?|$)/.test(url)) {
    return new Response(JSON.stringify({ porEtapa: [], taxaConversao: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (/\/crm\/pipelines(\?|$)/.test(url)) {
    return new Response(JSON.stringify({ itens: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (/\/crm\/oportunidades(\?|$)/.test(url)) {
    return new Response(
      JSON.stringify({ itens: [], pagina: 1, tamanho: 25, total: 0 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (/\/crm\/admin\/campos-oportunidade(\?|$)/.test(url)) {
    return new Response(JSON.stringify({ itens: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ message: `fetch não mockado: ${url}` }), {
    status: 599,
  });
}) as typeof fetch;
