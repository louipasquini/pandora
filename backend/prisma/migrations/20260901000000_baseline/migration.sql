-- Baseline migration — Projeto Pandora (spec 001).
-- Ainda NÃO há entidade de negócio (essas entram nas specs 002+).
-- Esta migração existe para que `prisma migrate deploy` tenha o que aplicar
-- na CI e no harness de teste (schema-per-worker), e para carimbar a versão.

CREATE TABLE "_pandora_baseline" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "spec" TEXT NOT NULL DEFAULT '001-bootstrap-projeto',
    "applied_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "_pandora_baseline_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "_pandora_baseline_singleton" CHECK ("id" = 1)
);

COMMENT ON TABLE "_pandora_baseline" IS 'Marcador da migração baseline (spec 001). Pode ser removido quando a primeira entidade real for adicionada.';

INSERT INTO "_pandora_baseline" ("id") VALUES (1);
