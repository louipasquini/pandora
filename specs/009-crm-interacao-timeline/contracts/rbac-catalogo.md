# Contrato — Catálogo RBAC (+5)

| id | recurso | rótulo pt-BR |
| --- | --- | --- |
| `interacao:registrar` | `interacao` (novo) | Registrar interações (WhatsApp, e-mail, ligação, ticket, nota, NPS) |
| `interacao:gerir` | `interacao` (novo) | Editar e remover notas de outros autores |
| `segmento:ver` | `segmento` (novo) | Ver segmentos e seus membros |
| `segmento:gerir` | `segmento` (novo) | Criar, editar e excluir segmentos |
| `crm_admin:gerir_tags` | `crm_admin` (007) | Gerir o catálogo de tags (renomear, cor, ativar/desativar) |

`assertCatalogoCoerente()` continua passando. `administrador` e a credencial de serviço
concedem as 5 de graça (special-case já existente na 004) — **sem** migração de dados nem
seed. As permissões `lead:*` (004/008) e `pessoa:*`/`conta:*` (005) **não mudam**.
