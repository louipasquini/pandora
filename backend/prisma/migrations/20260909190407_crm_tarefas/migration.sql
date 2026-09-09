-- CreateEnum
CREATE TYPE "TarefaStatus" AS ENUM ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA');

-- CreateTable
CREATE TABLE "tarefa" (
    "id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "status" "TarefaStatus" NOT NULL DEFAULT 'PENDENTE',
    "data_vencimento" TIMESTAMPTZ(6),
    "concluido_em" TIMESTAMPTZ(6),
    "pessoa_id" UUID,
    "lead_id" UUID,
    "oportunidade_id" UUID,
    "responsavel_id" UUID,
    "criado_por_id" UUID,
    "origem" TEXT NOT NULL DEFAULT 'manual',
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tarefa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarefa_checklist_item" (
    "id" UUID NOT NULL,
    "tarefa_id" UUID NOT NULL,
    "texto" TEXT NOT NULL,
    "concluido" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tarefa_checklist_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarefa_cronometro_periodo" (
    "id" UUID NOT NULL,
    "tarefa_id" UUID NOT NULL,
    "inicio" TIMESTAMPTZ(6) NOT NULL,
    "fim" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tarefa_cronometro_periodo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarefa_nota" (
    "id" UUID NOT NULL,
    "tarefa_id" UUID NOT NULL,
    "autor_id" UUID,
    "conteudo" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tarefa_nota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarefa_dependencia" (
    "id" UUID NOT NULL,
    "tarefa_id" UUID NOT NULL,
    "depende_de_id" UUID NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tarefa_dependencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarefa_delegacao" (
    "id" UUID NOT NULL,
    "tarefa_id" UUID NOT NULL,
    "de_responsavel_id" UUID,
    "para_responsavel_id" UUID,
    "autor_id" UUID,
    "motivo" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tarefa_delegacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_tarefa_audit" (
    "id" UUID NOT NULL,
    "autor" TEXT NOT NULL,
    "quando" TIMESTAMPTZ(6) NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidade_id" UUID NOT NULL,
    "campo" TEXT NOT NULL,
    "valor_anterior" JSONB,
    "valor_novo" JSONB,
    "motivo" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_tarefa_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tarefa_responsavel_id_status_idx" ON "tarefa"("responsavel_id", "status");

-- CreateIndex
CREATE INDEX "tarefa_pessoa_id_idx" ON "tarefa"("pessoa_id");

-- CreateIndex
CREATE INDEX "tarefa_lead_id_idx" ON "tarefa"("lead_id");

-- CreateIndex
CREATE INDEX "tarefa_oportunidade_id_idx" ON "tarefa"("oportunidade_id");

-- CreateIndex
CREATE INDEX "tarefa_data_vencimento_idx" ON "tarefa"("data_vencimento");

-- CreateIndex
CREATE UNIQUE INDEX "tarefa_checklist_item_tarefa_id_ordem_key" ON "tarefa_checklist_item"("tarefa_id", "ordem");

-- CreateIndex
CREATE INDEX "tarefa_cronometro_periodo_tarefa_id_idx" ON "tarefa_cronometro_periodo"("tarefa_id");

-- CreateIndex
CREATE INDEX "tarefa_nota_tarefa_id_criado_em_idx" ON "tarefa_nota"("tarefa_id", "criado_em");

-- CreateIndex
CREATE UNIQUE INDEX "tarefa_dependencia_tarefa_id_depende_de_id_key" ON "tarefa_dependencia"("tarefa_id", "depende_de_id");

-- CreateIndex
CREATE INDEX "tarefa_delegacao_tarefa_id_criado_em_idx" ON "tarefa_delegacao"("tarefa_id", "criado_em");

-- CreateIndex
CREATE INDEX "crm_tarefa_audit_entidade_entidade_id_idx" ON "crm_tarefa_audit"("entidade", "entidade_id");

-- AddForeignKey
ALTER TABLE "tarefa" ADD CONSTRAINT "tarefa_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefa" ADD CONSTRAINT "tarefa_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefa" ADD CONSTRAINT "tarefa_oportunidade_id_fkey" FOREIGN KEY ("oportunidade_id") REFERENCES "oportunidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefa" ADD CONSTRAINT "tarefa_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefa" ADD CONSTRAINT "tarefa_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefa_checklist_item" ADD CONSTRAINT "tarefa_checklist_item_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "tarefa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefa_cronometro_periodo" ADD CONSTRAINT "tarefa_cronometro_periodo_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "tarefa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefa_nota" ADD CONSTRAINT "tarefa_nota_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "tarefa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefa_nota" ADD CONSTRAINT "tarefa_nota_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefa_dependencia" ADD CONSTRAINT "tarefa_dependencia_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "tarefa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefa_dependencia" ADD CONSTRAINT "tarefa_dependencia_depende_de_id_fkey" FOREIGN KEY ("depende_de_id") REFERENCES "tarefa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefa_delegacao" ADD CONSTRAINT "tarefa_delegacao_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "tarefa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefa_delegacao" ADD CONSTRAINT "tarefa_delegacao_de_responsavel_id_fkey" FOREIGN KEY ("de_responsavel_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefa_delegacao" ADD CONSTRAINT "tarefa_delegacao_para_responsavel_id_fkey" FOREIGN KEY ("para_responsavel_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefa_delegacao" ADD CONSTRAINT "tarefa_delegacao_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
