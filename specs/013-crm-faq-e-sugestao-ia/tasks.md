# Tasks: CRM · FAQ e Sugestão de IA

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`
**Branch**: `013-crm-faq-e-sugestao-ia`

Convenção: `[P]` = paralelizável (arquivos diferentes, sem dependência entre si). `[USn]`
mapeia à user story do `spec.md` (US1=P1 editor de FAQ, US2=P1 sugestão de resposta,
US3=P2 múltiplas perguntas, US4=P2 sugestão de campo personalizado, US5=P3 feedback de
utilidade).

## Fase 1 — Schema e migração

- [ ] T001 `backend/prisma/schema.prisma`: + enums `SugestaoIaTipo`, `SugestaoIaStatus`;
      + models `FaqItem`, `FaqItemVersao`, `SugestaoIa` (bounded context `crm`),
      `CampoPersonalizadoPessoa`, `ValorCampoPessoa` (bounded context `clientes`, espelhando
      `CampoPersonalizadoLead`/`ValorCampoLead`); + coluna `sugestaoIaId` (nullable,
      `@unique`) em `RespostaAtendimento`; relações inversas em `Usuario`, `Atendimento`,
      `Interacao`, `Lead`, `Pessoa`.
- [ ] T002 Gerar a migração (`prisma migrate dev --name crm_faq_sugestao_ia`) e editar o SQL
      gerado: `CHECK` de exclusividade do alvo em `sugestao_ia` (`tipo='CAMPO_PERSONALIZADO'`
      → exatamente um de `campo_personalizado_lead_id`/`campo_personalizado_pessoa_id`;
      `tipo='RESPOSTA'` → nenhum dos dois) via SQL bruto (Prisma não modela `CHECK`).
- [ ] T003 Rodar a migração + regenerar `@prisma/client`; confirmar `test/setup-db.ts` limpo
      num schema novo.

## Fase 2 — Domínio puro (sem banco) `[P]` entre arquivos diferentes

- [ ] T004 [P][US2] `backend/src/crm/domain/sugestao-ia/prompt.ts` + `.spec.ts` —
      `montarPrompt(mensagem, faqAtiva, definicoesCampo)`: determinístico, mensagem/listas
      vazias não quebram, inclui só FAQ `ativo=true`.
- [ ] T005 [P][US2][US3] `backend/src/crm/domain/sugestao-ia/parse-resposta.ts` +
      `.spec.ts` — `interpretarRespostaIa(bruto)`: schema `zod` da lista de sugestões; JSON
      inválido/campo faltando/tipo desconhecido → item descartado, nunca lança; tudo
      descartado → `{ sugestoes: [], problema }`; múltiplas perguntas → múltiplas entradas
      `tipo: RESPOSTA`.
- [ ] T006 [P][US5] `backend/src/crm/domain/sugestao-ia/estado.ts` + `.spec.ts` —
      `podeDecidir(status)` (só `PENDENTE`), `podeAvaliarUtilidade(status)` (só
      `ACEITA`\|`REJEITADA`).
- [ ] T007 [P] `backend/src/crm/domain/sugestao-ia/index.ts` — barrel.

## Fase 3 — Persistência (infra)

- [ ] T008 [P][US1] `backend/src/crm/infra/faq/faq.repository.ts` — CRUD de `FaqItem`
      (listar com filtro `ativo`, obter, criar, atualizar) + `faq-versao.repository.ts`
      (criar versão, listar por `faqItemId`).
- [ ] T009 [P][US2] `backend/src/crm/infra/sugestao-ia/sugestao-ia.repository.ts` — criar em
      lote, listar por `atendimentoId`/`interacaoOrigemId`, obter, atualizar status/decisão/
      feedback, `substituirPendentesDaInteracao(interacaoOrigemId)` (D-05).
- [ ] T010 [P] `backend/src/crm/infra/faq/index.ts` + `backend/src/crm/infra/sugestao-ia/
      index.ts` — barrels.
- [ ] T011 [P][US4] `backend/src/clientes/infra/campo-personalizado-pessoa.repository.ts` —
      CRUD de definição + valores (mesmo formato de
      `backend/src/crm/infra/lead/campo-personalizado-lead.repository.ts` da 008, mas em
      `clientes`).

## Fase 4 — Aplicação (serviços)

- [ ] T012 [US1] `backend/src/crm/application/faq/faq.service.ts` — `criar`/`atualizar`
      (gera `FaqItemVersao` só quando `pergunta`/`resposta` mudam de valor), `listar`
      (catálogo `ativo=true` e lista administrativa), `obter`, `listarVersoes`.
- [ ] T013 [US4] `backend/src/clientes/application/campo-personalizado-pessoa.service.ts` —
      `criarDefinicao`/`atualizarDefinicao`/`listarDefinicoes` (mesma validação de `chave`
      única/imutável, `tipo` imutável da 008), `substituirValores(pessoaId, valores)` (mesmo
      contrato de substituição total do `LeadService`), `definirValor(pessoaId, definicaoId,
      valor)` (grava **1** valor — usado pela porta, T015).
- [ ] T014 [US4] `backend/src/clientes/campo-personalizado-pessoa.controller.ts` —
      `/clientes/campos-personalizados`, `/clientes/admin/campos-personalizados/**`,
      `/pessoas/:id/campos-personalizados` (`GET`/`PUT`) — ver `contracts/
      campo-personalizado-pessoa.md`.
- [ ] T015 [US4] `backend/src/core/campo-personalizado-pessoa/porta-campo-personalizado-
      pessoa.ts` — interface `PortaCampoPersonalizadoPessoa` (`listarDefinicoesAtivas`,
      `definirValor`) + token `PORTA_CAMPO_PERSONALIZADO_PESSOA`; reexportar em
      `core/core.module.ts`.
- [ ] T016 [US4] `backend/src/clientes/infra/porta-campo-personalizado-pessoa.adapter.ts` —
      implementa a porta chamando `CampoPersonalizadoPessoaService` (T013).
- [ ] T017 Renomear `backend/src/clientes/identidade-wiring.module.ts` →
      `backend/src/clientes/clientes-wiring.module.ts` / `ClientesWiringModule`: mantém o
      provider de `PORTA_IDENTIDADE` (008) e acrescenta o de `PORTA_CAMPO_PERSONALIZADO_
      PESSOA` (T016); editar o import em `backend/src/app.module.ts`.
- [ ] T018 [US2] `backend/src/crm/application/sugestao-ia/anthropic-sugestao-ia.client.ts` —
      implementação real de `SugestaoIaClient` (porta em
      `backend/src/crm/domain/sugestao-ia/sugestao-ia-client.ts` — interface +
      `SUGESTAO_IA_CLIENT`, mesmo padrão de `GraphApiClient`/`GRAPH_API_CLIENT`, 011): busca
      a credencial ativa em `integracao` (`nome` convencionado, `tipo=CONEXAO_INTERNA`,
      `alvo=EXTERNO`) via `IntegracaoRepository` + `decifrar`, chama a API da Anthropic via
      `fetch` nativo, devolve o texto bruto para `interpretarRespostaIa` (T005) processar;
      credencial ausente/inativa ou chamada falha → devolve resultado de falha (nunca lança
      para o chamador travar o atendimento — FR-014).
- [ ] T019 [US2][US3] `backend/src/crm/application/sugestao-ia/gerar-sugestao.service.ts` —
      `gerar(atendimentoId, interacaoId, autor)`: valida `interacaoId` pertence ao
      atendimento e `direcao=ENTRADA`; busca FAQ ativa + definições de campo personalizado
      aplicáveis (lead ou pessoa, conforme a âncora); `montarPrompt` → `SugestaoIaClient` →
      `interpretarRespostaIa`; `substituirPendentesDaInteracao` (D-05) antes de inserir as
      novas linhas `PENDENTE`.
- [ ] T020 [US2][US4][US5] `backend/src/crm/application/sugestao-ia/decidir-sugestao.
      service.ts` — `aceitar(sugestaoId, conteudoFinal?, autor)`: `tipo=RESPOSTA` só marca
      `ACEITA`; `tipo=CAMPO_PERSONALIZADO` marca `ACEITA` **e** grava via
      `ValorCampoLeadService` (lead, 008) ou `PortaCampoPersonalizadoPessoa` (pessoa, T015),
      verificando `lead:editar`/`pessoa:editar` via `SujeitoRbacService` antes de gravar;
      `rejeitar(sugestaoId, autor)`; `avaliarUtilidade(sugestaoId, util, autor)` (usa
      `podeAvaliarUtilidade`, T006); todas exigem `podeDecidir`/`status` correto, senão 409.
- [ ] T021 [US2] Editar `backend/src/crm/application/atendimento/resposta.service.ts` —
      `registrarResposta` aceita `sugestaoId` opcional: valida sugestão `ACEITA`/
      `tipo=RESPOSTA` do mesmo atendimento (senão 409), força `viaIa=true`, passa
      `sugestaoIaId` para `RespostaRepository.criar` (T022).
- [ ] T022 Editar `backend/src/crm/infra/atendimento/resposta.repository.ts` — `criar`
      aceita `sugestaoIaId` opcional.
- [ ] T023 `backend/src/crm/crm.module.ts`: registrar os novos repositórios/serviços/
      controllers/provider `SUGESTAO_IA_CLIENT`. `backend/src/clientes/clientes.module.ts`:
      registrar `CampoPersonalizadoPessoaService`/repositório/controller.

## Fase 5 — HTTP (controllers + DTO + RBAC)

- [ ] T024 [P] `backend/src/crm/dto/faq/faq.schema.ts` — zod: criar, atualizar, listar.
- [ ] T025 [P] `backend/src/crm/dto/sugestao-ia/sugestao-ia.schema.ts` — zod: gerar
      (`interacaoId`), aceitar (`conteudoFinal?`), feedback (`util`).
- [ ] T026 [P] `backend/src/clientes/dto/campo-personalizado-pessoa.schema.ts` — zod: criar/
      atualizar definição, substituir valores (mesma validação por `tipo` da 008).
- [ ] T027 [US1] `backend/src/crm/faq.controller.ts` — `/crm/faq`, `/crm/admin/faq/**` (ver
      `contracts/faq.md`).
- [ ] T028 [US2][US3][US4][US5] Editar `backend/src/crm/atendimento.controller.ts` — `/crm/
      atendimentos/:id/sugestoes/**` (gerar, listar, aceitar, rejeitar, feedback — ver
      `contracts/sugestao-ia.md`); editar a rota `responder` já existente para aceitar
      `sugestaoId` (T021).
- [ ] T029 `backend/src/auth/rbac/catalogo.ts`: +2 permissões — `crm_admin:gerir_faq`,
      `pessoa:gerir_campos_personalizados`.

## Fase 6 — Testes backend

- [ ] T030 [P] e2e `backend/test/crm-faq-sugestao-ia.e2e-spec.ts` — cobre todos os cenários
      de `plan.md §Testing` (FAQ + versionamento, geração de sugestão com dublê, D-05,
      aceitar/rejeitar resposta ligando ao `responder`, aceitar campo personalizado
      lead/pessoa, feedback, guard/escopo, catálogo, regressão 003–012).
- [ ] T031 Rodar suíte unit + e2e completa; confirmar 0 regressão nas specs 003–012.

## Fase 7 — Frontend

- [ ] T032 [P][US1] `frontend/src/faq/use-faq.ts` — hooks TanStack Query (listar, criar,
      atualizar, versões), inline no padrão de `crm-admin/IntegracoesTab.tsx`.
- [ ] T033 [US1] `frontend/src/faq/FaqAdminPage.tsx` — lista + criar/editar + histórico de
      versões, atrás de `crm_admin:gerir_faq` (leitura administrativa `crm_admin:ver`).
- [ ] T034 [P][US2][US3][US4][US5] `frontend/src/atendimento/use-sugestoes.ts` — hooks
      TanStack Query (gerar, listar por atendimento, aceitar, rejeitar, feedback).
- [ ] T035 [US2][US3][US4][US5] `frontend/src/atendimento/PainelSugestoes.tsx` — pedir
      sugestão para a mensagem selecionada; lista de sugestões (uma por pergunta
      identificada) com aceitar/rejeitar/feedback independentes; aceitar `RESPOSTA`
      pré-preenche o composer existente (sem enviar sozinho); aceitar `CAMPO_PERSONALIZADO`
      mostra o valor final editável antes de confirmar.
- [ ] T036 Editar `frontend/src/atendimento/ConversaAtendimento.tsx` — monta
      `PainelSugestoes` ao lado da timeline/composer; passa o `sugestaoId` aceito para o
      envio de resposta.
- [ ] T037 [P][US4] `frontend/src/clientes/CamposPersonalizadosPessoaTab.tsx` (ou
      equivalente na tela de detalhe de pessoa já existente) — espelha a aba já existente em
      Leads (008): lista valores + edição manual, atrás de `pessoa:editar`.
- [ ] T038 Editar `frontend/src/nav-items.ts`/`router.tsx` — item **FAQ** em
      **CRM · Administração**.
- [ ] T039 [P] Testes de componente (`vitest` + Testing Library) para T033/T035/T037.
- [ ] T040 `npm run lint && npm run typecheck && npm run build` nos dois workspaces.

## Fase 8 — Documentação

- [ ] T041 `docs/013-crm-faq-e-sugestao-ia.md` — novo, mesma profundidade de
      `docs/012-crm-chat-ao-vivo.md`.
- [ ] T042 `ROADMAP.md` — marcar `013` concluído, parágrafo-resumo completo.
- [ ] T043 `README.md` — bullet `✅ 013 — crm-faq-e-sugestao-ia`, status "em andamento" →
      próxima spec.
- [ ] T044 `speckit-agent-context-update` — regenerar a seção `SPECKIT` do `CLAUDE.md` (move
      o resumo da 012 para dentro de `<details>`, escreve o resumo definitivo da 013,
      atualiza "Plano ativo").

## Dependências entre fases

`Fase 1` (schema) bloqueia tudo. `Fase 2` (domínio puro) e `Fase 3` (infra) são
paralelizáveis entre si (arquivos diferentes) mas ambas antecedem a `Fase 4` (aplicação).
Dentro da `Fase 4`: T012 (FAQ) é independente do resto; T013–T017 (campo personalizado de
pessoa + porta) precisam vir antes de T020 (decidir-sugestão, consome a porta); T018–T019
(cliente IA + gerar-sugestão) independentes de T013–T017, mas ambos precisam existir antes de
T020. `Fase 5` (HTTP) depende da `Fase 4` completa. `Fase 6` (testes e2e) depende da `Fase 5`.
`Fase 7` (frontend) pode começar em paralelo à `Fase 6` assim que os contratos HTTP da
`Fase 5` estiverem estáveis. `Fase 8` (docs) é sempre a última.

## Estratégia de implementação — MVP primeiro

**MVP = US1 + US2** (T001–T012, T018–T019, T021–T022, T024–T025, T027–T028 recortado só para
`RESPOSTA`, T030 recortado): FAQ cadastrável e sugestão de resposta única por mensagem, sem
múltiplas perguntas nem campo personalizado. US3 (múltiplas perguntas) já vem de graça de
`interpretarRespostaIa` (T005) se o prompt/parser forem escritos para lista desde o início —
na prática **US1+US2+US3 nascem juntas** nesta spec. US4 (campo personalizado) é a fatia mais
isolada (toda a Fase de porta/wiring, T013–T017, T020 parte `CAMPO_PERSONALIZADO`) — pode ser
entregue depois, num 2º incremento, sem quebrar US1–US3. US5 (feedback) é a menor fatia,
aditiva no fim.
