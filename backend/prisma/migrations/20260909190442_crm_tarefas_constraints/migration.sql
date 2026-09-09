-- Índice único PARCIAL: no máximo 1 período de cronômetro aberto por tarefa
-- (D-04, spec 016). Prisma não modela índice parcial no schema.
CREATE UNIQUE INDEX "tarefa_cronometro_periodo_tarefa_id_aberto_key"
  ON "tarefa_cronometro_periodo" ("tarefa_id")
  WHERE "fim" IS NULL;

-- CHECK defensivo: uma tarefa não pode depender de si mesma (D-05, spec 016).
-- Prisma não modela CHECK no schema.
ALTER TABLE "tarefa_dependencia"
  ADD CONSTRAINT "tarefa_dependencia_nao_autodependente"
  CHECK ("tarefa_id" <> "depende_de_id");
