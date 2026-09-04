# 009 — Timeline de Interações do CRM: histórico unificado, notas, tags e segmentos

Terceira fatia da **Fase 1 (CRM)**. Fecha o esboço 5.2‑E da visão que ainda faltava:
**`interacao`** (timeline unificada pessoa/lead), **`tag`** promovida a entidade de 1ª
classe compartilhada (migrando o `lead.tags: String[]` da spec 008), e **`segmento`**
(query salva declarativa, avaliada sempre na leitura). Mora no _bounded context_ **`crm`**
(já não-vazio desde a 007/008).

Spec, plano e contratos: [`specs/009-crm-interacao-timeline/`](../specs/009-crm-interacao-timeline/).

`CONTEXT_MODULES` segue com **11**. **7ª migração de negócio**
(`20260904150000_crm_interacao`). **0 dependência nova** (backend e frontend). **Nenhuma
variável de ambiente nova.** **Nenhuma porta nova.** **+5 permissões** de catálogo
(`interacao:registrar`, `interacao:gerir`, `segmento:ver`, `segmento:gerir`,
`crm_admin:gerir_tags`).

---

## Âncora polimórfica + timeline unida na leitura (CL-01)

`interacao` tem `pessoa_id` **XOR** `lead_id` — nunca os dois, nunca nenhum
(`CHECK (num_nonnulls(pessoa_id, lead_id) = 1)` no banco + validação de borda
`validarAncora` no domínio). A timeline de uma **pessoa** é a **união**, resolvida a cada
leitura, de: (a) interações com `pessoa_id = :id`; (b) interações de todo `lead` cujo
`pessoa_id` aponta para ela (leads convertidos, spec 008 CL-01). Nenhuma linha é copiada ou
re-apontada na conversão — coerente com "nada migrado fisicamente" da 008.

```sql
-- InteracaoRepository.listarPorPessoa (Prisma OR/JOIN, uma query, sem N+1)
SELECT i.* FROM interacao i LEFT JOIN lead l ON i.lead_id = l.id
WHERE i.pessoa_id = :pessoaId OR l.pessoa_id = :pessoaId
ORDER BY i.ocorrido_em DESC;
```

A leitura da timeline **não ganha permissão nova**: por pessoa exige `pessoa:ver` (005);
por lead segue o escopo `lead:ver_todos`/`ver_proprios` já resolvido pela 008
(`LeadConsultaService.exigirNoEscopo`, reusado por composição de serviço dentro do próprio
`crm`). A timeline da pessoa **inclui** interações de lead convertido mesmo que o sujeito
não tenha nenhuma permissão de `lead:*` — a permissão que vale ali é `pessoa:ver`.

## Por que nenhuma porta nova no `core` (diferente da 008)

A 008 precisou de `PortaIdentidade` porque a conversão Lead→Pessoa **chama um serviço com
lógica de negócio**. Esta spec só precisa que `interacao`/`tag_associacao` **referenciem**
`pessoa.id` por FK — nenhuma chamada a `src/clientes/**`. O `schema.prisma` já cruza
contexto por FK desde a 004/008 (`Lead.responsavelId → usuario`, `Lead.pessoaId → pessoa`);
a fronteira do Princípio VI é sobre **import de módulo TypeScript**, não sobre o schema
compartilhado. `import/no-restricted-paths` continua verde, `grep` de `import .*clientes`
em `src/crm/**` = 0.

---

## Mutabilidade: só `NOTA` (CL-05)

`interacao.tipo = NOTA` é a **única** editável/removível (_soft-delete_, `removido_em`) —
pelo autor (`interacao:registrar`) ou por quem tem `interacao:gerir` em nome de outro
autor. Qualquer canal (`WHATSAPP|EMAIL|LIGACAO|TICKET|NPS`) é **append-only**: um registro
incorreto se corrige com uma nova interação, nunca reescrevendo o histórico real de contato
com a aluna. Reforçado em duas camadas: `podeEditar()` no domínio (`405`/`409`/`403`
conforme o caso) e `CHECK ("tipo" = 'NOTA' OR ("editado_em" IS NULL AND "removido_em" IS
NULL))` no banco.

---

## Tag: entidade de 1ª classe compartilhada (CL-04)

`tag` (`slug` único, `rotulo`, `cor?`, `ativo`) + `tag_associacao` (uma de `lead_id`\|
`pessoa_id`\|`interacao_id`, `CHECK` de exclusividade + 3 índices únicos parciais — nenhuma
tag duplicada na mesma âncora). Associar por **texto** faz _upsert_ por slug — o mesmo texto
normalizado (variação de caixa/espaço) reaproveita a mesma linha `tag`, em qualquer âncora.

A migração **promove** o `lead.tags: String[]` da spec 008: a coluna é removida
(`ALTER TABLE lead DROP COLUMN tags`, sem _backfill_ — sem dado de produção nesta fase do
projeto). O contrato REST de `POST`/`DELETE /crm/leads/{id}/tags` (008) **não muda** — por
baixo, o `LeadService` passa a delegar ao `TagService` compartilhado, auditando como antes
em `crm_lead_audit`. `POST`/`DELETE /crm/pessoas/{id}/tags` e
`.../crm/interacoes/{id}/tags` usam o **mesmo formato de corpo** (`{ "tag": "<texto>" }` em
`POST` e `DELETE`, sem `:slug` no path — uniforme com o contrato original da 008), auditando
em `crm_interacao_audit`. `GET /crm/tags` (catálogo com contagem de uso por tipo de âncora,
`@AutenticadoBasta()`) e `GET .../{id}/tags` (tags atuais de uma âncora) completam a leitura.
Renomear/colorir/(des)ativar uma tag é administrativo, sob `crm_admin:gerir_tags`, auditado
em `crm_admin_audit` (007) — desativar não remove associações existentes, só impede **novo**
uso (422).

---

## Segmento: query salva, membros sempre derivados (CL-03)

`segmento` guarda `alvo` (`LEAD`\|`PESSOA`) + `filtro` (jsonb) validado contra um esquema
**fechado** por `alvo` (`filtro-segmento.ts`, zod `.strict()` — chave fora do conjunto, ou
de outro `alvo`, é 422). `construirWhere` traduz o filtro validado para uma condição
Prisma-like **pura** (testável sem banco). `GET /crm/segmentos/:id/membros` combina esse
`where` com o `where` de escopo de visão do sujeito (`LeadConsultaService.escopoDe` para
`LEAD`; `pessoa:ver` simples para `PESSOA`) — o segmento **nunca amplia** o que o sujeito já
pode ver, e os membros **nunca são materializados**: mudar um atributo do lead/pessoa
reflete na próxima leitura, sem nenhuma ação manual (regra 8.2.2).

---

## Domínio puro (`backend/src/crm/domain/{interacao,tag,segmento}/`, sem banco)

| Arquivo | O quê |
| --- | --- |
| `interacao/ancora.ts` | `validarAncora({pessoaId,leadId})` — XOR puro. |
| `interacao/mutabilidade.ts` | `podeEditar(interacao, sujeito)` — CL-05. |
| `interacao/validar-campos-tipo.ts` | `direcao`/`notaNps` obrigatórios/proibidos por `tipo`. |
| `tag/normalizar-tag.ts` | slug (`trim`+`lowercase`+espaço→`-`); **fonte única** — `domain/lead/normalizar-lead.ts` (008) passa a reexportar daqui em vez de duplicar. |
| `segmento/filtro-segmento.ts` | `validarFiltro(alvo, bruto)` (esquema fechado) + `construirWhere(validado)` (monta, não executa). |

Testes: `ancora.spec.ts`, `mutabilidade.spec.ts`, `validar-campos-tipo.spec.ts`,
`normalizar-tag.spec.ts`, `filtro-segmento.spec.ts` — todos sem banco.

## Persistência (Prisma — 7ª migração de negócio)

`20260904150000_crm_interacao` — 5 tabelas + 3 enums (`InteracaoTipo`, `InteracaoDirecao`,
`SegmentoAlvo`) + `ALTER TABLE lead DROP COLUMN tags`:

- **`interacao`** — âncora XOR (`CHECK`), `tipo`, `direcao?`, `conteudo`, `nota_nps?`
  (`SMALLINT`, só `NPS`), `autor_id?` (FK `usuario`, `Restrict`), `canal_origem?`/
  `id_externo?` (índice único parcial — idempotência da porta), `ocorrido_em`, `editado_em?`,
  `removido_em?`.
- **`tag`** — `slug` único, `rotulo`, `cor?`, `ativo`.
- **`tag_associacao`** — âncora XOR-de-três (`CHECK` + 3 índices únicos parciais),
  `criado_por?`.
- **`segmento`** — `alvo`, `filtro jsonb`, `ativo`, `criado_por` (FK `usuario`, `Restrict`).
- **`crm_interacao_audit`** — forma canônica `RegistroAuditoria` do core, append-only, só
  delta real. Simétrica a `crm_lead_audit`/`crm_admin_audit`.

Sem seed de negócio.

## Aplicação (`backend/src/crm/application/{interacao,tag,segmento}/`)

- **`InteracaoService`** — `criar` (âncora + campos por tipo + existência → 404),
  `listarPorPessoa`/`listarPorLead` (união e escopo), `obterPorId` (escopo pela âncora),
  `editarNota`/`removerNota` (aplica `podeEditar`; 405/409/403 conforme o caso).
- **`RegistrarInteracaoService`** — porta in-process (idempotente por `(canalOrigem,
  idExterno)`) exportada do `CrmModule` para as specs 011/012 injetarem.
- **`TagService`** — `associar`/`desassociar` por âncora (idempotente, roteia auditoria:
  lead→`crm_lead_audit`, pessoa/interacao→`crm_interacao_audit`), `listarCatalogo`,
  `criarExplicita`/`atualizar` (admin→`crm_admin_audit`), `listarDe` (leitura de uma âncora).
  Verifica a existência da âncora antes de associar/desassociar (404, não erro de FK).
- **`SegmentoService`** — CRUD (audita em `crm_interacao_audit`) + `listarMembros`
  (`construirWhere` + escopo de visão combinados).
- **`LeadService`/`RegistrarLeadService`** (008, editados) — tags delegam ao `TagService`;
  `criar` associa as tags iniciais **sem auditoria própria** (embutidas no `1` registro
  "criado", preservando o contrato de auditoria da 008).

## HTTP

| Rota | Marcador |
| --- | --- |
| `POST /crm/interacoes`, `PATCH`/`DELETE /crm/interacoes/:id`, `POST`/`DELETE .../tags` | `interacao:registrar` |
| `GET /crm/pessoas/:id/interacoes`, `GET/POST/DELETE /crm/pessoas/:id/tags` (GET = `pessoa:ver`) | `pessoa:ver` / `pessoa:editar` (005, sem permissão nova) |
| `GET /crm/leads/:id/interacoes`, `GET /crm/interacoes/:id`, `GET .../tags` | `@AutenticadoBasta()` — escopo resolvido no serviço |
| `GET /crm/tags` | `@AutenticadoBasta()` |
| `POST`/`PATCH /crm/admin/tags` | `crm_admin:gerir_tags` |
| `GET /crm/segmentos`, `.../:id`, `.../:id/membros` | `segmento:ver` |
| `POST`/`PATCH`/`DELETE /crm/segmentos` | `segmento:gerir` |

## RBAC (spec 004 estendida)

+5 permissões: `interacao:registrar`, `interacao:gerir` (recurso novo `interacao`);
`segmento:ver`, `segmento:gerir` (recurso novo `segmento`); `crm_admin:gerir_tags` (recurso
`crm_admin`, 007). As permissões `lead:*` (008) e `pessoa:*`/`conta:*` (005) **não mudam**.
`administrador` e a credencial de serviço concedem as 5 de graça — **0 migração de dados**.

## Frontend

- `frontend/src/interacoes/` — `TimelineInteracoes` (composer + lista + editar/remover nota,
  reusado em Pessoa e Lead) e `TagPicker` (chip picker, reusado em Pessoa, Lead e — via API —
  Interação).
- `frontend/src/segmentos/` — **CRM · Segmentos** (nova), atrás de `segmento:ver`:
  `SegmentosPage` (lista + criar) e `SegmentoDetalhePage` (filtro salvo + membros
  paginados).
- `PessoaDetailPage`/`LeadDetalhePage` ganham as seções Tags (via `TagPicker`) e Timeline
  (via `TimelineInteracoes`); o input de tag livre do lead (008) foi trocado pelo picker
  compartilhado.
- `lerSub(token)` (novo, `auth/decode-jwt.ts`) — só para UX (mostrar editar/remover na
  própria nota); a autorização real é sempre do backend.

## Clarificações (com o dono do produto, 2026-09-04)

- **CL-01** — âncora polimórfica + timeline unida **na leitura** (nunca re-apontada).
- **CL-02** — nota interna é `interacao.tipo = NOTA`, não uma tabela própria.
- **CL-03** — `segmento` é query salva declarativa; membros sempre derivados.
- **CL-04** — `tag` vira entidade de 1ª classe compartilhada, migrando a 008.
- **CL-05** — mutabilidade híbrida: `NOTA` editável/removível, canal append-only.

## Contagem

**0 dep nova** · **1 migração** (`20260904150000_crm_interacao`) · **~19 endpoints novos**
· **+5 permissões** de catálogo · **0 porta nova** · **0 `.env` nova**. Backend: **362
testes unitários** + **176 e2e** (Postgres real, `crm-interacao.e2e-spec.ts` + regressão
003–008 + `/health` = 11), todos verdes. Frontend: **66 testes** no total, verdes.

> **Nota de ambiente**: o sandbox de desenvolvimento que gerou esta spec não tinha acesso a
> Docker/Postgres (`docker compose up -d db` falhou por permissão do socket), então a
> migração e a suíte e2e só puderam ser verificadas na **CI do PR #8** (Postgres real) — que
> encontrou e levou à correção de 2 bugs reais que os testes unitários e o typecheck não
> detectavam: `interacao.autor_id`/`tag_associacao.criado_por`/`segmento.criado_por`
> recebendo o `sub` bruto do JWT (quebra com a credencial de serviço, que não é UUID de
> `Usuario` — corrigido: resolve para um `Usuario` real via `EntidadeId.isValido` +
> checagem no banco, ou `null`; `segmento.criado_por` virou nullable) e a faixa 0–10 de
> `notaNps` duplicada no DTO zod (mascarava o 422 semântico do domínio com um 400
> estrutural). Migração e e2e confirmadas verdes depois da correção.
