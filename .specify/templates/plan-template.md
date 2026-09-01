# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]

**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION]

**Primary Dependencies**: [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION]

**Storage**: [if applicable, e.g., PostgreSQL, CoreData, files or N/A]

**Testing**: [e.g., pytest, XCTest, cargo test or NEEDS CLARIFICATION]

**Target Platform**: [e.g., Linux server, iOS 15+, WASM or NEEDS CLARIFICATION]

**Project Type**: [e.g., library/cli/web-service/mobile-app/compiler/desktop-app or NEEDS CLARIFICATION]

**Performance Goals**: [domain-specific, e.g., 1000 req/s, 10k lines/sec, 60 fps or NEEDS CLARIFICATION]

**Constraints**: [domain-specific, e.g., <200ms p95, <100MB memory, offline-capable or NEEDS CLARIFICATION]

**Scale/Scope**: [domain-specific, e.g., 10k users, 1M LOC, 50 screens or NEEDS CLARIFICATION]

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Reference: `.specify/memory/constitution.md` (v1.0.0). For each gate, state how the design
complies, or record the violation in Complexity Tracking with a rejected simpler alternative.

- [ ] **I. Domínio, não origem**: toda entidade nova tem ID surrogate (UUID v7/ULID);
      identificadores de origem em tabelas `*_origem_ref`, nunca como PK; granularidade de
      negócio das entidades tocadas está decidida e documentada.
- [ ] **II. Clarificar antes de assumir**: nenhum `NEEDS CLARIFICATION` dependente do dono
      do produto permanece aberto; nenhum comportamento de negócio foi assumido.
- [ ] **III. Bordas finas**: nenhuma regra de negócio conhece nome de plataforma; adaptador
      por (plataforma × fonte); vocabulário de origem só na borda, versionado.
- [ ] **IV. Log de eventos + projeções**: evento cru imutável persistido; pipeline em etapas
      idempotentes com commit próprio e resultado explícito; sem estado mutável no ORM nem
      `commit()` de remendo.
- [ ] **V. Agregados derivados**: todo valor agregado é `f(eventos) -> estado`, não contador
      incremental; dinheiro por `dict[moeda, valor]`, própria vs afiliada separadas.
- [ ] **VI. Contextos delimitados**: comunicação entre contextos por evento/API interna;
      contexto a jusante observa, nunca escreve no contexto dono; ações da Central viram
      comando.
- [ ] **VII. Curadoria vs derivação**: campo curado e derivado em colunas/tabelas distintas;
      precedência na leitura; nenhum vínculo aplicado é auto-revertido (só alerta).
- [ ] **VIII. Superfície de escrita mínima**: nenhum endpoint de escrita novo sem
      justificativa registrada; nenhuma sincronização automática com API externa.
- [ ] **Padrões Transversais**: Dinheiro ×10000 sem float; tempo `timestamptz` UTC; status
      canônico com desconhecido → `REVISAR`; auditoria de mudanças curadas/manuais;
      `plataforma_origem` como dimensão de primeira classe.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
# [REMOVE IF UNUSED] Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# [REMOVE IF UNUSED] Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# [REMOVE IF UNUSED] Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure: feature modules, UI flows, platform tests]
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
