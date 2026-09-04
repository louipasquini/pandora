# Contrato — RBAC (catálogo estendido)

+6 permissões no catálogo (`backend/src/auth/rbac/catalogo.ts`), `administrador` e a
credencial de serviço recebem todas de graça, sem migração de dados/seed:

| id | recurso | rótulo |
| --- | --- | --- |
| `oportunidade:criar` | `oportunidade` | Criar oportunidades |
| `oportunidade:editar` | `oportunidade` | Editar oportunidades (título, valor, responsável, campos personalizados) |
| `oportunidade:mover` | `oportunidade` | Mover oportunidades entre etapas |
| `oportunidade:ver_todas` | `oportunidade` | Ver todas as oportunidades |
| `oportunidade:ver_proprias` | `oportunidade` | Ver apenas as oportunidades do próprio responsável |
| `crm_admin:gerir_pipelines` | `crm_admin` | Gerir pipelines, etapas, atribuição automática e campos personalizados de oportunidade |

## Porta `PortaObservacaoPagamentoCrm`

Chamada in-process (sem HTTP) — não tem permissão RBAC própria; o consumidor futuro
(Financeiro/Workflow) roda com a credencial de serviço no seu próprio contexto de
autenticação, que já equivale a `administrador`.

## `PortaObservacaoPagamentoCrm` — assinatura exportada do `CrmModule`

```ts
export interface PortaObservacaoPagamentoCrm {
  observarPagamentoConfirmado(input: { pessoaId: string }): Promise<void>;
}
```

Efeito (FR-023): para cada `oportunidade` `ABERTA` (em qualquer pipeline) ancorada
diretamente na `pessoaId`, move para a 1ª etapa `GANHA` (menor `ordem`) do respectivo
pipeline, `movidoPorId: null`, `motivo: null`. Sem oportunidade `ABERTA` para a pessoa →
no-op. Já `GANHA` → no-op (idempotente). **Não** consulta nem grava nenhuma tabela de
Contrato — essa tabela nem existe ainda (D-02). Esta spec não registra nenhum caller real;
testada isoladamente injetando o provider em um teste de integração.
