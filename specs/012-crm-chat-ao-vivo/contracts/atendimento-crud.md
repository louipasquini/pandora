# Contrato — Fila, Assumir e Responder

Base operacional: `/crm/atendimentos`. Leitura sob escopo `atendimento:ver_todos`\|
`ver_proprios` (mesmo padrão de `lead`/`oportunidade`, `@AutenticadoBasta()` + filtro no
`where` do serviço de consulta — nunca na serialização); `ver_proprios` = só
`atendenteAtualId` = sujeito. Escrita sob `atendimento:{atender,transferir,encerrar}`.

## `GET /crm/atendimentos?status=&prioridade=&equipeId=&mine=`

Lista a fila/inbox. Default `status` = `AGUARDANDO,EM_ATENDIMENTO` (encerrados exigem filtro
explícito). Ordenação: `ordenarFila` (D-06) — `prioridade` desc, depois `abertoEm` asc.

```json
{
  "itens": [
    {
      "id": "...",
      "pessoaId": "...", "leadId": null,
      "canal": "WHATSAPP",
      "status": "AGUARDANDO",
      "prioridade": "ALTA",
      "atendenteAtualId": null,
      "equipeId": "...",
      "abertoEm": "2026-09-04T12:00:00Z",
      "sla": { "estourado": true, "minutosDecorridos": 42, "minutosRestantes": null }
    }
  ]
}
```

`sla` é sempre calculado na leitura (`calcularSlaAtendimento`, nunca uma coluna — D-R3).

## `GET /crm/atendimentos/:id`

Detalhe + `sla` (mesmo formato acima). 404 fora do escopo de visão (`exigirNoEscopo`, mesmo
padrão 008/010).

## `GET /crm/atendimentos/:id/timeline`

Reaproveita a timeline unificada da 009 (`Interacao`), filtrada por
`atendimentoId = :id`, em ordem cronológica — inclui mensagens humanas, automáticas
(fora de expediente) e a nota de CSAT (`tipo: NPS`), quando existir.

## `POST /crm/atendimentos/:id/assumir`

`atendimento:atender`. Só válido para `status = AGUARDANDO`. Define
`atendenteAtualId = sujeito`, `status = EM_ATENDIMENTO`; se `equipeId` do atendimento era
`null`, preenche com uma equipe `ATENDIMENTO` ativa da qual o sujeito é membro (senão
mantém `null`). Já assumido por outra pessoa → **409** `{erro: 'ja_assumido'}`.

## `POST /crm/atendimentos/:id/responder`

`atendimento:atender`. Requer `atendenteAtualId = sujeito` — responder um atendimento de
outro atendente → **403** `{erro: 'nao_e_o_atendente_atual'}` (use transferência primeiro).
Body:

```json
{ "conteudo": "Oi! Como posso ajudar?", "viaIa": false }
```

Fluxo (D-data-model "Portas in-process" → `RespostaAtendimentoService`):

1. `status != EM_ATENDIMENTO` → **409** `{erro: 'atendimento_nao_esta_em_andamento'}`.
2. `canal = WHATSAPP` → delega ao contrato de envio já existente da 011
   (`POST /crm/whatsapp/mensagens`, mesma validação de janela de 24h/template — **nenhuma
   regra nova**, só reaproveitada); falha do provedor → **502**, nada é registrado.
3. `canal = MANUAL` → cria a `Interacao` diretamente (`direcao: SAIDA`, `autorId: sujeito`).
4. Em ambos: cria `RespostaAtendimento` (`atendenteId: sujeito`, `viaIa`); se
   `primeiraRespostaEm` ainda `null`, marca com `agoraUtc()`.
5. Sucesso → **201** `{ interacaoId, respostaId, primeiraResposta: boolean }`.

## `POST /crm/atendimentos/:id/encerrar`

`atendimento:encerrar`. Body `{ motivo?: string }`. `status != EM_ATENDIMENTO` → **409**.
Define `status = ENCERRADO`, `encerradoEm`, `encerradoPorId = sujeito`,
`csatSolicitadoEm = agoraUtc()`. Não envia nenhuma mensagem automaticamente (a captura de
CSAT é passiva — ver `transferencia-csat.md`).
