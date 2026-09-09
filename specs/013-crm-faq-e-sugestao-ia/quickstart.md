# Quickstart — 013-crm-faq-e-sugestao-ia

Pré-requisitos: mesmos da raiz (`README.md`) — Node 24, Postgres dev em `55432` já rodando,
`.env` configurado, migrações + seed da 004–012 já aplicadas.

```bash
# 1. Aplicar a migração desta spec (11ª de negócio) e regenerar o client
npm run prisma:migrate:dev --workspace backend
#    (em CI/staging: npm run prisma:migrate:deploy --workspace backend)

# 2. Qualidade
npm run lint && npm run typecheck && npm run build

# 3. Testes
npm test                    # unit backend (prompt, parse-resposta, estado) + frontend
npm run test:e2e            # e2e contra Postgres real (schema isolado) — usa o
                             # SugestaoIaClient dublê, 0 chamada de rede real à Anthropic

# 4. Subir e verificar
npm run start:dev --workspace backend   # :3001
npm run dev --workspace frontend        # :5174
curl http://localhost:3001/health       # contexts ainda = 11
```

## Configurar a credencial da Anthropic

Opcional em dev — só necessária para gerar uma sugestão real; testes/CI nunca chamam a API
de verdade (usam sempre o `SugestaoIaClient` dublê).

```bash
TOKEN=... # POST /auth/token

curl -sX POST localhost:3001/crm/admin/integracoes \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{
    "nome": "sugestao-ia-anthropic",
    "tipo": "CONEXAO_INTERNA",
    "alvo": "EXTERNO",
    "config": { "modelo": "claude-sonnet-5" },
    "segredo": "sk-ant-...",
    "ativo": true
  }'
```

## Fluxo manual (via `curl`, token de serviço — ver README raiz)

```bash
# Cadastrar um item de FAQ
curl -sX POST localhost:3001/crm/admin/faq \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"pergunta":"Qual o prazo de acesso ao curso?","resposta":"12 meses a partir da compra."}'

# Editar (gera nova versão) e conferir o histórico
curl -sX PATCH localhost:3001/crm/admin/faq/<id> \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"resposta":"12 meses corridos a partir da data da compra."}'
curl -s localhost:3001/crm/admin/faq/<id>/versoes -H "Authorization: Bearer $TOKEN"

# Catálogo (uso do atendente durante a conversa)
curl -s localhost:3001/crm/faq -H "Authorization: Bearer $TOKEN"

# Dentro de um atendimento em andamento (spec 012) — pedir sugestão para uma mensagem
curl -sX POST localhost:3001/crm/atendimentos/<atendimentoId>/sugestoes \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"interacaoId":"<interacaoId da mensagem da aluna>"}'

# Aceitar uma sugestão de resposta (não envia nada ainda)
curl -sX POST localhost:3001/crm/atendimentos/<atendimentoId>/sugestoes/<sugestaoId>/aceitar \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{}'

# Enviar de fato, ligando a resposta à sugestão aceita
curl -sX POST localhost:3001/crm/atendimentos/<atendimentoId>/responder \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"conteudo":"12 meses corridos a partir da compra.","sugestaoId":"<sugestaoId>"}'

# Avaliar utilidade após decidida
curl -sX POST localhost:3001/crm/atendimentos/<atendimentoId>/sugestoes/<sugestaoId>/feedback \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"util":true}'

# Campo personalizado de pessoa — definir o campo e aceitar uma sugestão que o preenche
curl -sX POST localhost:3001/clientes/admin/campos-personalizados \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"chave":"anos_experiencia","rotulo":"Anos de experiência","tipo":"NUMERO"}'
curl -sX POST localhost:3001/crm/atendimentos/<atendimentoId>/sugestoes/<sugestaoId2>/aceitar \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"conteudoFinal":"5"}'
curl -s localhost:3001/pessoas/<pessoaId>/campos-personalizados -H "Authorization: Bearer $TOKEN"
```

## Painel

`http://localhost:5174` → login → **CRM · Administração → FAQ** → lista + criar/editar +
histórico de versões (`crm_admin:gerir_faq`); dentro de **CRM · Chat ao Vivo** (012), a
conversa ganha um painel de sugestões — pedir sugestão para a mensagem selecionada,
aceitar/rejeitar cada uma independentemente, aceitar uma resposta pré-preenche o composer
sem enviar sozinho, aceitar um campo personalizado mostra o valor final editável antes de
confirmar, feedback (útil/não útil) disponível após decidida.

## Validação end-to-end desta spec

1. Cadastrar 2 itens de FAQ ativos cobrindo perguntas distintas; editar um deles e conferir
   que o histórico de versões mostra as duas versões, com autor e data.
2. Com um `SugestaoIaClient` dublê configurado para devolver 2 sugestões de resposta (uma por
   pergunta) a partir de uma única mensagem simulada com 2 perguntas — verificar 2 linhas
   `SugestaoIa` `PENDENTE`, decidíveis independentemente (US3).
3. Aceitar uma sugestão de resposta e verificar que **nada é enviado** até a chamada separada
   a `responder`; verificar que essa resposta grava `viaIa=true` e `sugestaoIaId` apontando de
   volta para a sugestão (FR-012).
4. Pedir uma nova sugestão para a mesma mensagem de origem — verificar que a sugestão pendente
   anterior daquela mensagem vira `SUBSTITUIDA` (D-05), sem acumular duplicatas.
5. Com um atendimento ancorado em `pessoa` (já convertida), aceitar uma sugestão de campo
   personalizado e verificar que o valor aparece em `GET /pessoas/:id/campos-personalizados`
   imediatamente — sem passar por `crm` importar `clientes` (verificável pelo lint
   `import/no-restricted-paths`, mesmo teste da 008).
6. Configurar o `SugestaoIaClient` dublê para simular falha (erro/timeout) e verificar que o
   `POST .../sugestoes` responde normalmente com lista vazia + aviso, e que o atendimento
   continua respondível manualmente sem nenhum bloqueio (FR-014, SC-006).
7. Rejeitar uma sugestão e tentar avaliar utilidade antes de decidir uma outra ainda
   `PENDENTE` — verificar 409; avaliar a já rejeitada — verificar sucesso.
