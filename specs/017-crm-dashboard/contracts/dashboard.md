# Contract — CRM · Dashboard (`/crm/dashboard/**`)

Todos autenticados (JWT da 003). `dashboard:ver` abre a página e os painéis "de visão
geral"; cada painel específico exige a permissão do recurso que expõe (ver
`data-model.md` › `PAINEIS_DASHBOARD`). `administrador`/credencial de serviço concedem tudo.
403 ≠ 401, corpo genérico. Erros de validação de query/body → 400/422.

Parâmetros comuns de período (query): `de` e `ate` (ISO date/date-time, **obrigatórios** nos
endpoints de painel), `equipeId?`, `responsavelId?`, `pipelineId?`. `de > ate` ou data
inválida → **400**. O "período anterior" (benchmark) é derivado no servidor (D-R4).

---

## Leitura — painéis

### `GET /crm/dashboard?de=&ate=&equipeId=&responsavelId=&pipelineId=`
Monta o dashboard: lista só os painéis que o sujeito pode ver (FR-006 — nunca 403 na página
inteira) já com os dados resolvidos.

**200**
```jsonc
{
  "periodo": {
    "de": "2026-08-01T00:00:00.000Z", "ate": "2026-08-31T23:59:59.999Z",
    "anteriorDe": "2026-07-02T00:00:00.000Z", "anteriorAte": "2026-07-31T23:59:59.999Z",
    "duracaoDias": 31, "bucket": "dia"
  },
  "paineis": [
    {
      "id": "visao_geral", "titulo": "Visão geral", "formato": "numero",
      "dados": {
        "leadsNovos":        { "valor": 42, "periodoAnterior": 30, "delta": 12, "deltaPercentual": 0.4 },
        "oportunidadesCriadas": { "valor": 18, "periodoAnterior": 20, "delta": -2, "deltaPercentual": -0.1 },
        "oportunidadesGanhas":  { "valor": 6,  "periodoAnterior": 4,  "delta": 2,  "deltaPercentual": 0.5 },
        "oportunidadesPerdidas":{ "valor": 3,  "periodoAnterior": 5,  "delta": -2, "deltaPercentual": -0.4 },
        "valorEmAberto": [ { "moeda": "BRL", "valorInt": "1250000000" } ],
        "taxaConversao": 0.667,
        "tarefasConcluidasNoPrazo": { "valor": 25, "periodoAnterior": 19, "delta": 6, "deltaPercentual": 0.316 }
      }
    },
    {
      "id": "funil_pipeline", "titulo": "Funil de conversão", "formato": "funil",
      "dados": {
        "pipelineId": "…",
        "porEtapa": [
          { "etapaId":"…","nome":"Prospecção","tipo":"ABERTA","quantidade":12,
            "valorEstimado":[{"moeda":"BRL","valorInt":"600000000"}],"tempoMedioHoras":73.2 },
          { "etapaId":"…","nome":"Ganhou","tipo":"GANHA","quantidade":6,
            "valorEstimado":[{"moeda":"BRL","valorInt":"420000000"}],"tempoMedioHoras":null }
        ],
        "taxaConversao": 0.667
      }
    },
    {
      "id": "ranking_comercial", "titulo": "Ranking do comercial", "formato": "ranking",
      "dados": { "itens": [
        { "responsavelId":"…","nome":"Ana","oportunidadesGanhas":4,
          "valorGanho":[{"moeda":"BRL","valorInt":"300000000"}],"taxaConversao":0.8,"pontosTarefa":120 }
      ] }
    },
    {
      "id": "qualidade_atendimento", "titulo": "Qualidade do atendimento", "formato": "numero",
      "dados": {
        "tempoMedioPrimeiraRespostaMinutos": { "valor": 14.2, "periodoAnterior": 18.0, "delta": -3.8, "deltaPercentual": -0.211 },
        "percentualDentroSla": 0.86,
        "csatMedio": 8.7, "distribuicaoCsat": { "0":0,"1":0,"…":0,"9":12,"10":30 },
        "taxaResolucao": 0.91,
        "porAtendente": [ { "atendenteId":"…","nome":"João","atendimentos":22,"csatMedio":9.1,"tempoMedioRespostaMinutos":11.0 } ],
        "porDia": [ { "rotulo":"2026-08-01","abertos":4,"encerrados":3 } ]
      }
    },
    {
      "id": "leads_por_origem", "titulo": "Leads por origem", "formato": "tabela",
      "dados": { "colunas": ["origem","leads","convertidos","taxaConversao"],
                 "linhas": [ ["instagram", 20, 6, 0.3], ["indicacao", 12, 8, 0.667] ] }
    },
    {
      "id": "serie_oportunidades", "titulo": "Oportunidades no tempo", "formato": "serie_temporal",
      "dados": { "bucket": "dia",
                 "series": [
                   { "nome":"criadas", "pontos":[{"rotulo":"2026-08-01","valor":2}] },
                   { "nome":"ganhas",  "pontos":[{"rotulo":"2026-08-01","valor":1}] }
                 ] }
    }
  ]
}
```

### `GET /crm/dashboard/paineis/:id?de=&ate=&…[&formato=csv]`
Um painel isolado (para recarregar só ele / exportar). `:id` fora de `PAINEIS_DASHBOARD` →
404. Sem a permissão do painel → 403. `formato=csv` só em `tabela`/`ranking` (senão 400) →
`text/csv` (`Content-Disposition: attachment`), 1 linha por item + cabeçalho estável.

### `GET /crm/dashboard/paineis` (catálogo)
**200** `{ "paineis": [ { "id","titulo","formato","permissao": "oportunidade:ver_todas"|null, "visivel": true } ] }`
— `visivel` já resolvido para o sujeito.

---

## Metas

### `GET /crm/dashboard/metas?periodo=&referencia=`
`dashboard:ver`. Lista metas (default: período corrente) com o atingimento derivado.
**200**
```jsonc
{ "itens": [ {
  "id":"…","metrica":"valor_ganho","periodo":"MES","referencia":"2026-08-01",
  "alvo": { "valorInt":"5000000000","moeda":"BRL" },
  "escopo": { "equipeId":"…","responsavelId":null },
  "descricao":"Meta de agosto — Comercial",
  "inicio":"2026-08-01T00:00:00.000Z","fim":"2026-08-31T23:59:59.999Z",
  "realizado": { "valorInt":"3000000000","moeda":"BRL" },
  "percentual": 0.6, "status": "em_risco", "noRitmo": false
} ] }
```
Métrica de contagem: `alvo` e `realizado` viram `{ "valor": 20 }` (sem `moeda`).

### `POST /crm/dashboard/metas`  ·  `dashboard:gerir_metas`
```jsonc
{ "metrica":"valor_ganho", "periodo":"MES", "referencia":"2026-08-15",
  "alvo": { "valorInt":"5000000000", "moeda":"BRL" },
  "equipeId":"…", "responsavelId": null, "descricao":"…" }
```
- `metrica` fora de `METRICAS_META` → 422. `referencia` normalizada para o 1º dia do
  mês/trimestre.
- métrica monetária sem `alvo.moeda` (ou de contagem **com** `moeda`) → 422.
- `equipeId`/`responsavelId` inexistente → 422.
- **201** com a meta + atingimento. Audita `criar` em `crm_dashboard_audit`.

### `PATCH /crm/dashboard/metas/:id`  ·  `dashboard:gerir_metas`
Campos parciais (`alvo`, `descricao`, `equipeId`, `responsavelId`). `metrica`/`periodo`/
`referencia` **imutáveis** (crie outra meta). No-op → **200** sem linha de auditoria.

### `DELETE /crm/dashboard/metas/:id`  ·  `dashboard:gerir_metas`
Remove a linha (D-06). Audita `remover`. **204**. Inexistente → 404.

### `GET /crm/dashboard/notificacoes`
`dashboard:ver`. Metas do sujeito (todas se `dashboard:gerir_metas`/`administrador`; senão as
de escopo `responsavelId = sub` ou de equipe em que ele é membro) que estão `em_risco`,
`batida` ou `estourada` no período corrente. In-app, sem envio externo (CL-02).
**200** `{ "itens": [ { "metaId":"…","metrica":"…","status":"em_risco","percentual":0.6,"referencia":"2026-08-01" } ] }`

---

## Visões salvas

### `GET /crm/dashboard/visoes`
`dashboard:ver`. As visões do sujeito: as próprias (`somenteLeitura:false`) + as
compartilhadas com algum perfil dele (`somenteLeitura:true`).
**200** `{ "itens": [ { "id","nome","filtros","paineis":["visao_geral","funil_pipeline"],
"dono": true, "somenteLeitura": false, "perfilCompartilhadoId": null } ] }`

### `POST /crm/dashboard/visoes`  ·  `dashboard:ver`
```jsonc
{ "nome":"Meu comercial", "filtros": { "periodo": {"tipo":"relativo","dias":30}, "equipeId":"…" },
  "paineis": ["visao_geral","funil_pipeline","ranking_comercial"],
  "perfilCompartilhadoId": null }
```
- `filtros`/`paineis` validados por zod fechado; id de painel desconhecido no `paineis` →
  422 na criação (só é ignorado ao **reidratar**, não ao gravar).
- credencial de serviço (não é `Usuario`) → **400**.
- **201**. Audita `criar`.

### `PATCH /crm/dashboard/visoes/:id`  ·  `dashboard:ver` (só o dono)
Editar `nome`/`filtros`/`paineis`/`perfilCompartilhadoId`. Não-dono → **403**. No-op → 200
sem auditoria.

### `POST /crm/dashboard/visoes/:id/clonar`  ·  `dashboard:ver`
Cria uma cópia com `dono_usuario_id = sub`, `perfil_compartilhado_id = null`, `nome` +=
" (cópia)". Serve para pegar uma visão compartilhada e torná-la própria. **201**.

### `DELETE /crm/dashboard/visoes/:id`  ·  `dashboard:ver` (só o dono)
**204**. Não-dono → 403. Inexistente → 404. Audita `remover`.

---

## Escopo de visão (todos os painéis)

Cada painel resolve o `where` de escopo pelo serviço de consulta do recurso que agrega
(`OportunidadeConsultaService`/`TarefaConsultaService`/`LeadConsultaService`/
`AtendimentoConsultaService`). Filtros `equipeId`/`responsavelId`/`pipelineId` só
**restringem** — nunca ampliam o que o sujeito já vê (FR-005/SC-002). Sujeito com
`*:ver_proprias`/`ver_proprios` recebe os painéis do time (ex.: `ranking_comercial`, que
exige `oportunidade:ver_todas`) **omitidos da lista**, não com 403.
