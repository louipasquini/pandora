-- CreateEnum
CREATE TYPE "ExecucaoDisparoStatus" AS ENUM ('AGENDADO', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO', 'ERRO');

-- CreateEnum
CREATE TYPE "MensagemDisparoStatus" AS ENUM ('PENDENTE', 'ENVIANDO', 'ENVIADA', 'FALHOU', 'PULADA');

-- CreateEnum
CREATE TYPE "DisparoVariante" AS ENUM ('A', 'B');

-- CreateTable
CREATE TABLE "execucao_disparo" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "canal_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "template_b_id" UUID,
    "percentual_variante_b" INTEGER,
    "segmento_id" UUID,
    "csv_criar_lead" BOOLEAN,
    "agendado_para" TIMESTAMPTZ(6),
    "status" "ExecucaoDisparoStatus" NOT NULL DEFAULT 'AGENDADO',
    "iniciado_em" TIMESTAMPTZ(6),
    "concluido_em" TIMESTAMPTZ(6),
    "cancelado_em" TIMESTAMPTZ(6),
    "erro_detalhe" TEXT,
    "criado_por" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "execucao_disparo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disparo_contato_importado" (
    "id" UUID NOT NULL,
    "execucao_disparo_id" UUID NOT NULL,
    "telefone" TEXT NOT NULL,
    "nome" TEXT,
    "lead_id" UUID,
    "pessoa_id" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disparo_contato_importado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagem_disparo" (
    "id" UUID NOT NULL,
    "execucao_disparo_id" UUID NOT NULL,
    "telefone" TEXT NOT NULL,
    "pessoa_id" UUID,
    "lead_id" UUID,
    "variante" "DisparoVariante",
    "status" "MensagemDisparoStatus" NOT NULL DEFAULT 'PENDENTE',
    "motivo" TEXT,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "mensagem_whatsapp_id" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mensagem_disparo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "execucao_disparo_status_agendado_para_idx" ON "execucao_disparo"("status", "agendado_para");

-- CreateIndex
CREATE INDEX "execucao_disparo_canal_id_idx" ON "execucao_disparo"("canal_id");

-- CreateIndex
CREATE INDEX "execucao_disparo_segmento_id_idx" ON "execucao_disparo"("segmento_id");

-- CreateIndex
CREATE UNIQUE INDEX "disparo_contato_importado_execucao_disparo_id_telefone_key" ON "disparo_contato_importado"("execucao_disparo_id", "telefone");

-- CreateIndex
CREATE UNIQUE INDEX "mensagem_disparo_mensagem_whatsapp_id_key" ON "mensagem_disparo"("mensagem_whatsapp_id");

-- CreateIndex
CREATE INDEX "mensagem_disparo_execucao_disparo_id_status_idx" ON "mensagem_disparo"("execucao_disparo_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "mensagem_disparo_execucao_disparo_id_telefone_key" ON "mensagem_disparo"("execucao_disparo_id", "telefone");

-- AddForeignKey
ALTER TABLE "execucao_disparo" ADD CONSTRAINT "execucao_disparo_canal_id_fkey" FOREIGN KEY ("canal_id") REFERENCES "canal_whatsapp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execucao_disparo" ADD CONSTRAINT "execucao_disparo_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "template_whatsapp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execucao_disparo" ADD CONSTRAINT "execucao_disparo_template_b_id_fkey" FOREIGN KEY ("template_b_id") REFERENCES "template_whatsapp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execucao_disparo" ADD CONSTRAINT "execucao_disparo_segmento_id_fkey" FOREIGN KEY ("segmento_id") REFERENCES "segmento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execucao_disparo" ADD CONSTRAINT "execucao_disparo_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disparo_contato_importado" ADD CONSTRAINT "disparo_contato_importado_execucao_disparo_id_fkey" FOREIGN KEY ("execucao_disparo_id") REFERENCES "execucao_disparo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disparo_contato_importado" ADD CONSTRAINT "disparo_contato_importado_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disparo_contato_importado" ADD CONSTRAINT "disparo_contato_importado_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagem_disparo" ADD CONSTRAINT "mensagem_disparo_execucao_disparo_id_fkey" FOREIGN KEY ("execucao_disparo_id") REFERENCES "execucao_disparo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagem_disparo" ADD CONSTRAINT "mensagem_disparo_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagem_disparo" ADD CONSTRAINT "mensagem_disparo_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagem_disparo" ADD CONSTRAINT "mensagem_disparo_mensagem_whatsapp_id_fkey" FOREIGN KEY ("mensagem_whatsapp_id") REFERENCES "mensagem_whatsapp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CheckConstraint (Prisma não modela CHECK — spec 015, par variante B/percentual)
ALTER TABLE "execucao_disparo" ADD CONSTRAINT "execucao_disparo_variante_b_par_check"
  CHECK (("template_b_id" IS NULL) = ("percentual_variante_b" IS NULL));
