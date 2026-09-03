# Specification Quality Checklist: Value Objects e primitivas canônicas do `core`

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-02
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
  - Nota: a spec cita `bigint`, zod e `Date` em Assumptions/Constraints por serem decisões
    de trade-off herdadas da constituição/001 — mesmo padrão adotado na spec 001. Os
    Functional Requirements permanecem em termos de comportamento observável.
- [x] Focused on user value and business needs (o "usuário" é quem implementa 003–056)
- [x] Written for non-technical stakeholders (User Stories e Success Criteria em linguagem de resultado)
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — os 3 (FR-004 moedas, FR-009 arredondamento,
      FR-020 status de contrato) foram resolvidos com o dono do produto em 2026-09-02 e
      registrados na seção Clarifications
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (foco em resultado observável)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified (dinheiro, tempo, status, config)
- [x] Scope is clearly bounded (sem frontend/endpoint/entidade/adapter; agregação fora)
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows (5 user stories P1–P2)
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification (além do trade-off explícito, como na 001)

## Notes

- Todos os itens passaram. Rodada de `/speckit-specify` resolveu 3 decisões do dono do
  produto (Princípio II) em 2026-09-02: `Moeda` = ISO 4217 validado (aberto);
  `multiplicarPorEscalar` só aceita fator inteiro (rateio via `ratear`, sem arredondamento
  implícito); `StatusContratoCanonico` = `ATIVO`/`EXPIRADO`/`CANCELADO`/`DESCONHECIDO`,
  libera acesso só `ATIVO`.
- Rodada de `/speckit-clarify` (2026-09-02) resolveu mais 3: `liberaAcesso(EM_ATRASO)` =
  `true` (core permissivo; revogação por tolerância é do contexto `contratos`);
  `parseInstante` do `core` só aceita formatos de máquina não ambíguos (planilha/`dd/mm/aaaa`
  → adapter de CSV); `RegistroAuditoria.origem` = enum fechado
  `CURADORIA`/`AJUSTE_MANUAL`/`MIGRACAO`.
- Spec pronta para `/speckit-plan`.
