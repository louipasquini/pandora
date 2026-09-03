-- spec 005 — invariante "no máximo um primário por pessoa" (FR-002 / FR-003) no
-- nível do banco. Índice único parcial: o Prisma 6 não o expressa no schema.prisma,
-- então mora nesta migração à mão (mesmo padrão do índice parcial da baseline).

CREATE UNIQUE INDEX "pessoa_email_um_primario"
  ON "pessoa_email" ("pessoa_id") WHERE "primario";

CREATE UNIQUE INDEX "pessoa_telefone_um_primario"
  ON "pessoa_telefone" ("pessoa_id") WHERE "primario";
