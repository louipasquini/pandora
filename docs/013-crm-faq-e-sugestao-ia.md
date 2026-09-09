# 013 — CRM · FAQ e Sugestão de IA

Sétima fatia da **Fase 1 (CRM)** — base de FAQ versionada e sugestão de IA no Chat ao Vivo
(visão Parte 8.3/8.5/10.6). Mora no _bounded context_ **`crm`** (já não-vazio desde a
007–012); estende também **`clientes`** (spec 005) com campo personalizado de `pessoa`.

Spec, plano, pesquisa, modelo de dados e contratos:
[`specs/013-crm-faq-e-sugestao-ia/`](../specs/013-crm-faq-e-sugestao-ia/).

`CONTEXT_MODULES` segue com **11**. **11ª migração de negócio**
(`20260909120000_crm_faq_sugestao_ia`) — 5 tabelas novas (`faq_item`, `faq_item_versao`,
`sugestao_ia` no `crm`; `campo_personalizado_pessoa`, `valor_campo_pessoa` no `clientes`) +
2 enums + 1 coluna em `resposta_atendimento` (`sugestao_ia_id`). **0 dependência nova.**
**0 chave `.env` nova** (a credencial da Anthropic reaproveita a tabela `integracao` já
existente desde a 007). **+2 permissões** de catálogo (`crm_admin:gerir_faq`,
`pessoa:gerir_campos_personalizados`). **~24 endpoints autenticados, 0 endpoint público
novo.**

---

## Decisões do dono do produto (2026-09-09, resolvidas antes do `spec.md`)

Três decisões bloqueavam esta spec — todas resolvidas com o dono do produto antes de
qualquer código:

- **FAQ sem vínculo de produto/campanha.** O `ROADMAP.md` descrevia `faq_item` com FK para
  Produto (Financeiro) ou Campanha (Marketing) — **nenhuma das duas entidades existe ainda**
  neste ponto do roadmap (`produto` só nasce na spec 023, `campanha` na 032, ambas muito
  depois da 013, que é Fase 1 · CRM). Decisão: `faq_item` nasce como uma lista única, sem
  nenhum dos dois vínculos; uma spec futura acrescenta as colunas quando as entidades
  existirem de verdade — sem stub, sem FK solto.
- **Campo personalizado sugerido vale para lead e pessoa.** Como a maioria das conversas do
  Chat ao Vivo é com `pessoa` já convertida (pós-1ª venda), e só `lead` tinha campo
  personalizado (spec 008), esta spec estende `clientes` com
  `campo_personalizado_pessoa`/`valor_campo_pessoa` — mesma estrutura, espelhada campo a
  campo.
- **Provedor de IA: API da Anthropic (Claude).** Chamada HTTP direta (`fetch` nativo),
  atrás de uma porta própria — sem SDK novo.

## FAQ: por que uma tabela de versão dedicada, não `crm_admin_audit`

`crm_admin_audit` (007) guarda **deltas de campo** — ótimo para configuração (nome, ativo,
segredo definido/rotacionado), ruim para reconstruir "qual era o texto completo da resposta
na versão 3". `faq_item_versao` é uma tabela de histórico de **1ª classe**, com **snapshot
completo** por edição — mesmo raciocínio que `oportunidade_movimentacao` (010) e
`resposta_atendimento`/`transferencia_atendimento` (012) já registraram para conteúdo de
negócio versionado, em vez do audit genérico. `FaqItem` não guarda "quem criou" (isso já
fica na 1ª `FaqItemVersao`) e `FaqItemVersao.autor` é uma **string livre, não uma FK** —
mesmo padrão de `crm_admin_audit.autor` — porque administrar FAQ pode ser feito pela
credencial de serviço (cujo `sub` não é um `Usuario.id` real), não só por um usuário
autenticado.

## Sugestão de IA: sempre síncrona, sempre dentro de um atendimento, nunca autoritativa

`POST /crm/atendimentos/:id/sugestoes` recebe o id de uma `Interacao` **de entrada** já
registrada (a mensagem da pessoa/lead selecionada pelo atendente), busca a FAQ ativa e as
definições de campo personalizado aplicáveis (de `lead` ou `pessoa`, conforme a âncora do
atendimento), monta um prompt determinístico (`montarPrompt`, `crm/domain/sugestao-ia/
prompt.ts`, puro) e chama o `SugestaoIaClient` **uma única vez**, de forma síncrona — nunca
fora de um atendimento, nunca um job de fundo (mesmo racional de volume baixo já assumido
pela 012). A resposta bruta é interpretada por `interpretarRespostaIa`
(`parse-resposta.ts`, puro) — um item inválido é descartado sem derrubar os demais; se nada
sobrar, a lista fica vazia (nunca uma sugestão de baixa confiança — FR-006).

Governança (Parte 10.6, etapa 1) é reforçada na própria API, não só por convenção de UI:
- **`tipo=RESPOSTA`**: `aceitar` só marca `status=ACEITA` — **nunca envia nada**. O envio
  de fato segue exigindo uma chamada separada e explícita a `POST /crm/atendimentos/:id/
  responder` (012), agora aceitando um `sugestaoId` opcional que, quando presente, precisa
  apontar para uma sugestão `ACEITA`/`RESPOSTA` do mesmo atendimento (senão 409), força
  `viaIa=true` e grava `RespostaAtendimento.sugestaoIaId` — fechando o rastro de FR-012.
- **`tipo=CAMPO_PERSONALIZADO`**: `aceitar` **já grava** o valor no cadastro na mesma
  chamada — não existe um "enviar" separado para um campo de cadastro (FR-008 é explícito).
  Essa assimetria é intencional (research.md D-R6): a própria ação de aceitar É a
  confirmação humana exigida pela governança nesse caso.

Pedir uma nova sugestão para a mesma mensagem de origem **substitui** (`status=SUBSTITUIDA`)
qualquer sugestão anterior daquela mensagem que ainda estivesse pendente — nunca acumula
duplicatas para a mesma pergunta (D-05).

## 2ª porta de inversão de dependência do projeto

Escrever um valor de campo personalizado em `pessoa` a partir do `crm` cruzaria a fronteira
do Princípio VI (contextos delimitados). A solução é a mesma já aprovada para `Lead` →
`Pessoa` na conversão (spec 008): `PortaCampoPersonalizadoPessoa`
(`core/campo-personalizado-pessoa/`, só interface + token DI) implementada por
`PortaCampoPersonalizadoPessoaAdapter` em `clientes/infra/`. O módulo `@Global()` que já
expunha `PORTA_IDENTIDADE` (`identidade-wiring.module.ts`) foi **renomeado** para
`clientes-wiring.module.ts`/`ClientesWiringModule` e passou a expor as duas portas — em vez
de multiplicar um módulo de 1 linha por porta nova. `crm` continua **sem importar
`src/clientes/**`**; para `lead`, que já mora no mesmo bounded context, a escrita usa
diretamente `ValorCampoService.definirValor` (novo método, grava 1 valor sem tocar nos
demais — espelha `ValorCampoPessoaService.definirValor`).

## Credencial da Anthropic reaproveita `integracao` (spec 007), ociosa até aqui

A spec 007 modelou `integracao` (`tipo API_KEY|WEBHOOK|CONEXAO_INTERNA`, `alvo FINANCEIRO|
MARKETING|CENTRAL|EXTERNO`, segredo cifrado, projeção de leitura que nunca revela o valor)
prevendo consumidores futuros — a 011 optou por um modelo dedicado (`canal_whatsapp`) por
precisar de campos muito específicos, e até esta spec **nenhum consumidor real** havia
usado a tabela genérica. Uma única credencial de API para o sistema inteiro é exatamente o
caso simples para o qual `integracao` foi desenhada: uma linha `tipo=CONEXAO_INTERNA`
(o sistema chamando um serviço externo — por isso não `API_KEY`, que é para uma chave que o
sistema *emite*), `alvo=EXTERNO`, `nome` convencionado (`sugestao-ia-anthropic`), com o
modelo (`config.modelo`, ex. `claude-sonnet-5`) guardado sem segredo — editável via `PATCH
/crm/admin/integracoes/{id}` já existente. **0 tabela nova de credencial, 0 chave `.env`
nova, 0 permissão nova** só para isso — `AnthropicSugestaoIaClient` busca a integração ativa
por nome e decifra com a mesma `CRM_INTEGRACAO_CIFRA_KEY`.

## Falha do provedor de IA nunca bloqueia o atendimento

`SugestaoIaClient.gerarSugestoes` **nunca lança** — credencial ausente/ilegível, falha de
rede, resposta com status de erro, ou resposta sem texto interpretável devolvem `{ ok:
false, motivo }`. `GerarSugestaoService` trata isso como "0 sugestões disponíveis" (mesmo
caminho de "sem correspondência na FAQ"), nunca como um erro que impede o atendente de
responder manualmente. Testado com um `SugestaoIaClient` dublê nos testes — **0 chamada de
rede real** em unit/e2e/CI.

## Reuso máximo do que já existia

- **`AtendimentoConsultaService`/`exigirNoEscopo`** (012) — leitura de sugestões segue o
  mesmo escopo `ver_todos`\|`ver_proprios` do atendimento.
- **`InteracaoRepository`** (009) — toda sugestão nasce de uma `Interacao` de entrada já
  registrada; nenhum evento cru novo.
- **`IntegracaoRepository`/`cifrar`/`decifrar`/`cifraIntegracaoKey`** (007) — credencial da
  IA, primeiro consumidor real da tabela genérica.
- **`CampoPersonalizadoLead`/`ValorCampoLead`** (008) — destino de campo personalizado
  quando o atendimento é de um `lead`; `campo_personalizado_pessoa` espelha a estrutura
  campo a campo para `pessoa`.
- **`PortaIdentidade`/`identidade-wiring.module.ts`** (008) — mesmo padrão e mesmo módulo
  (renomeado) reaproveitados para a 2ª porta do projeto.

## RBAC (spec 004 estendido)

| Permissão | O que libera |
| --- | --- |
| `crm_admin:gerir_faq` | Criar, editar e desativar itens de FAQ |
| `pessoa:gerir_campos_personalizados` | Administrar definições de campo personalizado de pessoa |

Gerar/decidir/avaliar uma sugestão reaproveita `atendimento:atender` (nenhuma permissão
nova) — decidir uma sugestão de campo personalizado verifica **dinamicamente**
`lead:editar`/`pessoa:editar` (conforme a âncora) via `SujeitoRbacService`, não só por
decorator estático, já que a mesma rota atende os dois casos. `administrador`/credencial de
serviço concedem de graça — **0 migração de dados/seed**.

## Endpoints

- **FAQ** (`/crm/faq`, `/crm/admin/faq/**`): `GET /crm/faq` (catálogo ativo,
  `@AutenticadoBasta()`), `GET`/`GET :id`/`GET :id/versoes` (`crm_admin:ver`), `POST`/
  `PATCH :id` (`crm_admin:gerir_faq`).
- **Sugestão** (`/crm/atendimentos/:id/sugestoes/**`): `GET` (escopo do atendimento),
  `POST` (gerar), `POST :sugestaoId/aceitar`, `POST :sugestaoId/rejeitar`,
  `POST :sugestaoId/feedback` — todos `atendimento:atender`.
- **`POST /crm/atendimentos/:id/responder`** (012, editado): `sugestaoId` opcional.
- **Campo personalizado de pessoa** (`/clientes/admin/campos-personalizados/**`,
  `/pessoas/:id/campos-personalizados`): espelha `/crm/admin/campos-lead` +
  `/crm/leads/:id/campos-personalizados` (008) campo a campo.
- Nenhum endpoint público novo.

## Testes

469 testes unitários backend (16 novos: `montarPrompt`, `interpretarRespostaIa`,
`podeDecidir`/`podeAvaliarUtilidade` — todos domínio puro, sem banco; +2 asserções
estendidas em `catalogo.spec.ts`) + 258 e2e (13 novos em `crm-faq-sugestao-ia.e2e-spec.ts`:
FAQ + versionamento, geração de sugestão com dublê, D-05, aceitar/rejeitar resposta ligando
ao `responder` existente, aceitar campo personalizado — lead e pessoa —, permissão dinâmica,
falha do provedor não bloqueia o atendimento, feedback pós-decisão, guard 401/403; +1
asserção estendida em `crm-admin.e2e-spec.ts` para a permissão nova) — suíte completa
003–013, todos verdes. Frontend: 90 testes (7 novos, `FaqAdminPage.test.tsx` +
`PainelSugestoes.test.tsx`), todos verdes. Lint/typecheck/build limpos nos dois workspaces.

## Frontend

`frontend/src/faq/`: **FaqAdminPage** — nova aba "FAQ" dentro de **CRM · Administração**
(007), atrás de `crm_admin:ver`/`crm_admin:gerir_faq` — lista + criar/editar + histórico de
versões por item. `frontend/src/atendimento/PainelSugestoes.tsx`: dentro da conversa do
Chat ao Vivo (`ConversaAtendimento.tsx`, 012) — escolhe a mensagem de entrada, pede
sugestão, decide cada uma independentemente; aceitar uma resposta pré-preenche o composer
existente (`conteudo`/`viaIa`/`sugestaoId` no estado do componente pai, nunca envia
sozinho); aceitar campo personalizado grava direto, desabilitado sem
`lead:editar`/`pessoa:editar`. `frontend/src/pessoas/PessoaDetailPage.tsx` ganha a mesma
seção "Campos personalizados" que `LeadDetalhePage.tsx` já tinha (componente espelhado).
Hooks TanStack Query inline — mesmo padrão de `whatsapp/WhatsappAdminPage.tsx`. **0
dependência nova** — testes usam `fireEvent`, mesmo padrão de `pipelines/
PipelinesPage.test.tsx`.

**Escopo cortado deliberadamente**: o seletor de mensagem de origem no painel de sugestões
usa a timeline já carregada pelo próprio atendimento (sem um componente de seleção dedicado
dentro de `TimelineInteracoes`, spec 009, que serve outras telas) — suficiente para o
volume baixo já assumido pela 012, sem acoplar um componente compartilhado a este fluxo
específico.
