# Specification Quality Checklist: Adaptadores de borda da plataforma Asaas

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-10
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs) — *nota: por ser uma spec de
  adaptador de integração, nomes de fonte (webhook de cobrança, `GET /v3/payments`, CSV) e
  do contrato `EventoCanonico` são vocabulário de domínio herdado das specs 006/018/019, não
  escolha de stack.*
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders (User Scenarios legíveis; requisitos técnicos
  isolados em Requirements)
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain (A-01..A-03 resolvidos com o dono do produto
  em 2026-09-10; A-04..A-16 são defaults documentados)
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable (SC-001..SC-015 com contagens/estados verificáveis)
- [x] Success criteria are technology-agnostic where it matters (falam de resultado
  observável — nº de transações, status canônico, 401/422 — não de internals)
- [x] All acceptance scenarios are defined (4 user stories, Given/When/Then)
- [x] Edge cases are identified (atributo novo, `customer` só id, `netValue` ausente,
  `value` inválido, `deleted:true`, array no corpo, BOM/encoding, reentrega, conta do path)
- [x] Scope is clearly bounded (A-03: 3 fontes + 2 webhooks por conta + 2 endpoints finos;
  admin/migração e enriquecimento de comprador fora)
- [x] Dependencies and assumptions identified (Assumptions: header do token, formato/status
  do CSV, `comprador` vazio no webhook/API, base URL, portas, sem migração v1)

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria (FR-001..FR-026 ligam a
  SC-001..SC-015 e às user stories)
- [x] User scenarios cover primary flows (webhook por conta P1, ponte Guru P1, API P2, CSV P3)
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification beyond o vocabulário de domínio
  herdado

## Notes

- 020 não está marcada `⚠ clarify` no ROADMAP. As 3 decisões de fato ambíguas (chave natural
  `payment.id`, papel do `externalReference` como ponte sem `plataforma`, escopo CSV/API)
  foram levadas ao dono do produto e respondidas em 2026-09-10 — registradas em `spec.md`
  §Clarifications (A-01, A-02, A-03).
- Diferença estrutural vs. 019: **duas contas** (`ASAAS_PRD`/`ASAAS_SVC`) → parsers recebem
  `conta` como parâmetro; webhooks por conta (`/prd`, `/svc`); `status-map` compartilhado
  registrado para as duas chaves.
- Nenhuma iteração de correção necessária: todos os itens passam na 1ª validação.
