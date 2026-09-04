# Specification Quality Checklist: Lead do CRM — entidade compartilhada, campos personalizados, scoring e conversão em pessoa

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-04
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
  - Nota: a spec cita nomes de artefatos do próprio projeto (`ResolverOuCriarService`,
    `crm_lead_audit`, rotas `/crm/leads`) por serem **contratos existentes** que a feature
    consome — mesmo padrão adotado nas specs 004–007. As regras de negócio permanecem
    agnósticas de framework.
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders (User Stories em linguagem de negócio)
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — CL-01, CL-02, CL-03 resolvidos com o dono
      do produto em 2026-09-04 (ver seção Clarifications). `grep` de `NEEDS CLARIFICATION`
      no spec.md = 0.
- [x] Requirements are testable and unambiguous (cada FR tem cenário/critério mensurável)
- [x] Success criteria are measurable (SC-001..SC-013, com métricas)
- [x] Success criteria are technology-agnostic (falam de comportamento observável)
- [x] All acceptance scenarios are defined (6 user stories, Given/When/Then)
- [x] Edge cases are identified (seção Edge Cases)
- [x] Scope is clearly bounded (seção Out of Scope + Assumptions)
- [x] Dependencies and assumptions identified (seções Dependencies e Assumptions)

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows (CRUD, escopo por permissão, scoring, conversão,
      campos personalizados, painel)
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification (além dos contratos do projeto)

## Notes

- **Pronta para `/speckit-plan`**: CL-01 (arquivar+vincular), CL-02 (porta `PortaIdentidade`
  no `core`) e CL-03 (esquema administrável de campos personalizados) resolvidas com o dono
  do produto em 2026-09-04. As demais ambiguidades foram resolvidas com padrões razoáveis
  documentados na seção "Decisões já tomadas nesta spec".
- **Desvio consciente de "byte-idêntico ao catálogo da 007"**: a resolução de CL-03
  acrescenta **uma** permissão (`crm_admin:gerir_campos_lead`) ao recurso `crm_admin` —
  mesmo padrão de extensão das specs 005–007; SC-011 foi ajustada.
