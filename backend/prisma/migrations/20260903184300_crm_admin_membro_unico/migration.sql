-- Índice único PARCIAL: ≤1 vínculo ATIVO por (equipe, usuário).
-- Histórico de reentrada (linhas com saiu_em preenchido) é permitido.
-- O Prisma não expressa índice parcial no schema — daí o SQL manual (spec 007).
-- Segue o padrão da spec 005 (`..142000_clientes_primario_unico`).
CREATE UNIQUE INDEX "equipe_membro_ativo_unico"
  ON "equipe_membro" ("equipe_id", "usuario_id")
  WHERE "saiu_em" IS NULL;
