# Contract — `EventoCanonico` (schema)

`domain/evento-canonico.ts` — schema `zod` + tipo inferido. É a forma canônica que um
adapter de borda (specs 019–022) produz de um `payload_bruto`. Nesta spec só é **definido e
validado**; o único consumidor é `classificar()` (etapa 1).

```ts
// núcleo obrigatório
plataformaOrigem: z.nativeEnum(PlataformaOrigem)
idOrigem:         z.string().min(1)
tipoOrigem:       z.string().min(1)
statusOrigem:     z.string()            // cru — a tradução p/ StatusTransacaoCanonico é dos adapters
ocorridoEm:       z.string()            // passado por parseInstante(): resolve Instante | { invalido, motivo }
                                        //   — motivo é registrado, não rejeita o evento

// opcionais (validados se presentes; transportados p/ as etapas 2–6 futuras)
comprador?: {
  nome?: string
  emails?: string[]
  telefones?: string[]
  documentos?: string[]
  endereco?: { logradouro?, numero?, complemento?, bairro?, cidade?, uf?, cep?, pais? }
}
valores?: {
  bruto?:    { valorInteiro: bigint, moeda: Moeda }   // Dinheiro do core — escala ×10000
  liquido?:  { valorInteiro: bigint, moeda: Moeda }
  taxas?:    { valorInteiro: bigint, moeda: Moeda }
  reembolso?:{ valorInteiro: bigint, moeda: Moeda }
}
oferta?: { codigoOrigem?: string, nomeOrigem?: string, quantidade?: number }
assinatura?: { ehRecorrencia?: boolean, ciclo?: string, numeroCiclo?: number }
ehAfiliada?: boolean
referenciaExterna?: { plataforma?: PlataformaOrigem, idOrigem?: string }
classificacao?: z.nativeEnum(Classificacao)   // dica preliminar do adapter
```

**Regras**
- Violação do schema → `422` ao chamador; **nunca** persistido como `evento_canonico`
  (FR-009).
- `moeda` **nunca** opcional dentro de um `Dinheiro`; `valorInteiro` é `bigint` (sem
  `float`) — Padrão Transversal / spec 002.
- `ocorridoEm` lixo → `parseInstante` devolve motivo; o evento é aceito, o motivo entra no
  `resultado` da etapa 1 e pode levar a `revisar` (nunca exceção — FR-020 análogo).
- **Sem** segredo/token no contrato (FR-010).
- `classificacao` fora do enum → ignorada por `classificar()` (trata como ausente).
