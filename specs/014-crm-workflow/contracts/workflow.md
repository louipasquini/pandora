# Contract — `/crm/workflow/**`

Todas as rotas exigem JWT válido (`JwtAuthGuard`, global). Leitura sob `crm_admin:ver`
(já existe, spec 007); escrita sob `crm_admin:gerir_workflow` (nova). 403 ≠ 401. Toda rota
que devolve uma lista responde `{ itens: [...] }` (mesmo padrão de
`GET /crm/admin/campos-oportunidade`, spec 010) — nunca um array bruto.

## Tipos compartilhados

### `CondicaoNo` (árvore de condições, E/OU)

```ts
type OperadorCondicao =
  | 'igual' | 'diferente'
  | 'contem' | 'nao_contem'      // só para campos do tipo lista (ex.: tags)
  | 'definido' | 'nao_definido'  // ignora `valor`
  | 'maior_que' | 'menor_que';   // só para campos numéricos

type CondicaoNo =
  | { tipo: 'grupo'; operador: 'E' | 'OU'; itens: CondicaoNo[] }
  | { tipo: 'folha'; campo: string; operador: OperadorCondicao; valor?: string | number | boolean };
```

`{ tipo: 'grupo', operador: 'E', itens: [] }` é o valor default de um fluxo sem condição
configurada — avalia sempre como verdadeiro. `campo` MUST pertencer ao catálogo fechado do
`gatilhoTipo` da versão (`camposDoGatilho`, research.md D-R3) — validado ao salvar o rascunho
e novamente ao publicar.

### `AcaoFluxo` (catálogo fechado, D-04 em spec.md)

```ts
type AcaoFluxo =
  | { tipo: 'MOVER_LEAD_ESTAGIO'; estagioDestino: LeadEstagio }
  | { tipo: 'APLICAR_TAG'; tag: string }
  | { tipo: 'REMOVER_TAG'; tag: string }
  | { tipo: 'REGISTRAR_NOTA'; conteudo: string }
  | { tipo: 'MOVER_OPORTUNIDADE_ETAPA'; etapaDestinoId: string; motivo?: string };
```

Compatibilidade por gatilho (`acoesCompativeis`, research.md D-R3/D-R4):

| `gatilhoTipo` | ações permitidas |
|---|---|
| `LEAD_CRIADO`, `LEAD_ESTAGIO_MUDOU`, `INTERACAO_REGISTRADA`, `TAG_APLICADA` | `MOVER_LEAD_ESTAGIO`, `APLICAR_TAG`, `REMOVER_TAG`, `REGISTRAR_NOTA` |
| `OPORTUNIDADE_ETAPA_MUDOU` | `MOVER_OPORTUNIDADE_ETAPA` |
| `EVENTO_EXTERNO` | qualquer uma do catálogo (nunca valida em profundidade — nunca executa, CL-01) |

Validação declarativa (FR-015): uma ação `MOVER_OPORTUNIDADE_ETAPA` com `motivo` ausente é
aceita ao **salvar o rascunho** (rascunho é livre), mas **rejeitada ao publicar** — a spec 010
só exige motivo quando a etapa de destino é, de fato, do tipo `PERDIDA`; como o rascunho não
resolve a etapa (só guarda `etapaDestinoId`), a validação de publicar MUST checar o `tipo` da
`EtapaPipeline` referenciada e recusar publicar (`422 { erro: 'motivo_obrigatorio' }`) se for
`PERDIDA` sem `motivo`.

## Ciclo de vida do fluxo

### `POST /crm/workflow/fluxos` — `crm_admin:gerir_workflow`

Body: `{ nome: string; descricao?: string; gatilhoTipo: FluxoGatilhoTipo }` — `gatilhoTipo` é
coluna `NOT NULL` em `FluxoAutomacaoVersao`, então já entra na criação (pode ser trocado
depois via `PUT .../rascunho`, enquanto a versão for `RASCUNHO`).

Cria `FluxoAutomacao` + `FluxoAutomacaoVersao` (`numero: 1`, `status: RASCUNHO`, `condicoes`
e `acoes` vazias por default — `{tipo:'grupo',operador:'E',itens:[]}` / `[]` — editáveis
depois via `PUT .../rascunho`).

201 → fluxo + versão 1 (rascunho).

### `GET /crm/workflow/fluxos` — `crm_admin:ver`

Query: `gatilhoTipo?`, `status?` (`RASCUNHO`\|`PUBLICADO`\|`ARQUIVADO`\|`SEM_PUBLICACAO` —
filtro derivado sobre a existência de versão `PUBLICADA`/`RASCUNHO`, não uma coluna).

Lista fluxos com a versão publicada atual (se houver) e o rascunho atual (se houver),
projetados lado a lado — nunca o histórico completo (isso é `GET .../versoes`).

### `GET /crm/workflow/fluxos/:id` — `crm_admin:ver`

Detalhe: metadado do fluxo + versão publicada atual + rascunho atual. 404 se não existe.

### `PATCH /crm/workflow/fluxos/:id` — `crm_admin:gerir_workflow`

Body: `{ nome?: string; descricao?: string }` — só metadado; nunca toca em versão/conteúdo.

### `PUT /crm/workflow/fluxos/:id/rascunho` — `crm_admin:gerir_workflow`

Body: `{ gatilhoTipo: FluxoGatilhoTipo; condicoes: CondicaoNo; acoes: AcaoFluxo[] }` —
substituição total do conteúdo do rascunho atual (D-01). Se não existir um `RASCUNHO` para
este fluxo, cria um novo (`numero = max(numero) + 1`), semeado vazio antes de aplicar o body.
Valida contra `camposDoGatilho`/`acoesCompativeis` (**forma**, não a validação de publicar) —
`422` se `condicoes` referenciar um campo fora do catálogo do gatilho, ou se alguma `acao` for
incompatível com o gatilho.

200 → versão em rascunho atualizada.

### `POST /crm/workflow/fluxos/:id/publicar` — `crm_admin:gerir_workflow`

Sem body. Roda `validarParaPublicar` (research.md, catalogo-gatilho.spec.ts /
validar-fluxo.spec.ts) sobre o rascunho atual — `422` se inválido (gatilho ausente/inválido,
ação incompatível, `MOVER_OPORTUNIDADE_ETAPA` para etapa `PERDIDA` sem `motivo`, ou sem
rascunho algum para publicar → `404`). Se válido: `RASCUNHO → PUBLICADA` (`publicadoPor`/
`publicadoEm` preenchidos); se já existia uma `PUBLICADA` para este fluxo, ela vira
`ARQUIVADA` (`arquivadoPor: 'sistema:substituida'`) — tudo numa transação.

200 → nova versão publicada.

### `POST /crm/workflow/fluxos/:id/arquivar` — `crm_admin:gerir_workflow`

Sem body. `PUBLICADA → ARQUIVADA` direto (sem promover nenhum rascunho). `409` se não houver
versão `PUBLICADA` no momento.

### `GET /crm/workflow/fluxos/:id/versoes` — `crm_admin:ver`

Histórico completo de versões do fluxo, mais recente primeiro.

## Simulação (US2, D-03)

### `POST /crm/workflow/fluxos/:id/simular` — `crm_admin:gerir_workflow`

Body: `{ versaoId?: string; registroTipo: 'LEAD' | 'OPORTUNIDADE'; registroId: string }` —
`versaoId` default: o rascunho atual, ou a publicada se não houver rascunho; `404` se o
`registroId` não existir.

Resposta: `{ gatilhoCompativel: boolean; condicaoSatisfeita: boolean; acoesQueSeriamDisparadas: AcaoFluxo[] }`
— `gatilhoCompativel: false` quando `registroTipo` não bate com o que o `gatilhoTipo` da
versão resolveria (ex.: simular um gatilho de oportunidade escolhendo um lead); nesse caso
`condicaoSatisfeita` e `acoesQueSeriamDisparadas` vêm vazios, sem erro. **Nenhuma escrita** —
mesmo em caso de "condição satisfeita", nenhuma ação é de fato executada.

## Execuções (US5)

### `GET /crm/workflow/fluxos/:id/execucoes` — `crm_admin:ver`

Query: `resultado?`, `desde?`/`ate?` (por `criadoEm`), paginação por cursor
(`limit`/`cursor`, mesmo padrão de listagens já existentes no projeto).

### `GET /crm/workflow/execucoes/:id` — `crm_admin:ver`

Detalhe de uma execução — inclui `acoesAplicadas` completo e `erroDetalhe`.

## Biblioteca de modelos (CL-02)

### `GET /crm/workflow/modelos` — `crm_admin:ver`

Lista `FluxoModelo` (semeados via seed).

### `POST /crm/workflow/modelos/:id/usar-como-base` — `crm_admin:gerir_workflow`

Body: `{ nome: string; descricao?: string }` (nome do fluxo novo — não reaproveita o nome do
modelo automaticamente, para evitar dois fluxos "iguais" por acidente).

Cria um `FluxoAutomacao` novo + `FluxoAutomacaoVersao` (`numero: 1`, `RASCUNHO`) com
`gatilhoTipo`/`condicoes`/`acoes` copiados do modelo. 201.

## Disparo manual do worker (paridade com `POST /ingestao/eventos/processar`, spec 006)

### `POST /crm/workflow/processar` — `crm_admin:gerir_workflow`

Sem body. Roda `WorkerService.processarPassada()` uma vez, de forma síncrona, e devolve um
resumo (`{ fontesVarridas, execucoesCriadas, execucoesFalharam }`) — usado por e2e
determinístico e por um eventual botão "rodar agora" no frontend; não depende do
`setInterval` (que fica desligado em teste, mesmo padrão `INGESTAO_WORKER_ENABLED=false`).

## Erros comuns

| Situação | Status |
|---|---|
| Sem token | 401 |
| Sem `crm_admin:ver`/`crm_admin:gerir_workflow` | 403 |
| Fluxo/versão/execução/modelo/registro (lead/oportunidade) inexistente | 404 |
| Corpo fora do schema zod | 422 |
| `condicoes`/`acoes` incompatíveis com o `gatilhoTipo` | 422 |
| Publicar sem rascunho válido | 422 |
| Arquivar sem versão publicada | 409 |
