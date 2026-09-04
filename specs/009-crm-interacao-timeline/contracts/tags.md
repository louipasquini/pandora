# Contrato — Tags compartilhadas (CL-04)

## Associação por texto (upsert por slug)

- `POST /crm/leads/{id}/tags` — `lead:editar` (**contrato inalterado da spec 008**), body
  `{ "tag": "Webinar Out" }`. Audita em `crm_lead_audit` (inalterado).
- `POST /crm/pessoas/{id}/tags` — `pessoa:editar` (005, sem permissão nova), mesmo body.
  Audita em `crm_interacao_audit`.
- `POST /crm/interacoes/{id}/tags` — `interacao:registrar`, mesmo body. Audita em
  `crm_interacao_audit`.

Em todos: normaliza o texto (`normalizar-tag.ts`), faz _upsert_ por `slug` em `tag` (cria se
não existe, reaproveita se existe), cria `tag_associacao` se ainda não existe para aquela
âncora (idempotente — repetir é no-op, sem duplicar, sem auditoria nova). Associar por
`slug`/`id` explícito de uma tag `ativo=false` → 422.

## Remoção

- `DELETE /crm/{leads|pessoas|interacoes}/{id}/tags` — mesmo body `{ "tag": "<texto>" }` da
  associação, mesma permissão correspondente (corpo em vez de `:slug` no path, para manter
  os três anchors no mesmo formato do contrato original da 008). Remove só a
  `tag_associacao` daquela âncora; a `tag` e as associações em outras âncoras permanecem.

## Catálogo

- `GET /crm/tags` — `@AutenticadoBasta()`. Lista `{ id, slug, rotulo, cor, ativo, usos:
  { lead, pessoa, interacao } }[]` — sem PII, útil para popular um picker de qualquer tela.
- `POST /crm/admin/tags` — `crm_admin:gerir_tags`. Cria uma tag explicitamente (mesmo efeito
  de uma associação criar por texto, mas sem associar a nada ainda).
- `PATCH /crm/admin/tags/{id}` — `crm_admin:gerir_tags`. Só `rotulo`/`cor`/`ativo`; `slug`
  é **imutável** após criada. Desativar (`ativo:false`) não remove associações existentes,
  só impede **novo** uso. Audita em `crm_admin_audit` (007).

## Migração da spec 008

`lead.tags: TEXT[]` é removida na mesma migração (data-model.md). O comportamento
observável de `POST`/`DELETE /crm/leads/{id}/tags` e do `GET` de detalhe do lead
(`tags: string[]` no corpo, agora resolvido por `JOIN` em `tag_associacao`/`tag`) **não
muda** — a suíte e2e da 008 que testa esses dois endpoints continua verde sem alterar
asserções (SC-004).
