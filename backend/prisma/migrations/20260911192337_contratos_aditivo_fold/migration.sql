-- CreateEnum
CREATE TYPE "StatusContratoCanonico" AS ENUM ('ATIVO', 'EXPIRADO', 'CANCELADO', 'DESCONHECIDO');

-- CreateEnum
CREATE TYPE "AditivoRotulo" AS ENUM ('COMPRA_INICIAL', 'RENOVACAO', 'PRORROGACAO', 'REEMBOLSO', 'SEM_EFEITO');

-- CreateTable
CREATE TABLE "contrato" (
    "id" UUID NOT NULL,
    "pessoa_id" UUID NOT NULL,
    "produto_id" UUID NOT NULL,
    "fim_acesso" TIMESTAMPTZ(6),
    "ticket_total" JSONB NOT NULL DEFAULT '{}',
    "valor_recebido" JSONB NOT NULL DEFAULT '{}',
    "tolerancia_atraso_dias" INTEGER NOT NULL DEFAULT 0,
    "contrato_assinado" BOOLEAN NOT NULL DEFAULT false,
    "ajuste_manual_status" "StatusContratoCanonico",
    "ajuste_manual_em" TIMESTAMPTZ(6),
    "ajuste_manual_autor" TEXT,
    "ajuste_manual_motivo" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "contrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aditivo" (
    "id" UUID NOT NULL,
    "contrato_id" UUID NOT NULL,
    "transacao_id" UUID NOT NULL,
    "rotulo" "AditivoRotulo" NOT NULL,
    "fim_acesso_resultante" TIMESTAMPTZ(6),
    "precisa_revisao" BOOLEAN NOT NULL DEFAULT false,
    "motivo_revisao" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "aditivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contrato_audit" (
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

    CONSTRAINT "contrato_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contrato_produto_id_idx" ON "contrato"("produto_id");

-- CreateIndex
CREATE UNIQUE INDEX "contrato_pessoa_id_produto_id_key" ON "contrato"("pessoa_id", "produto_id");

-- CreateIndex
CREATE UNIQUE INDEX "aditivo_transacao_id_key" ON "aditivo"("transacao_id");

-- CreateIndex
CREATE INDEX "aditivo_contrato_id_idx" ON "aditivo"("contrato_id");

-- CreateIndex
CREATE INDEX "contrato_audit_entidade_entidade_id_idx" ON "contrato_audit"("entidade", "entidade_id");

-- AddForeignKey
ALTER TABLE "transacao" ADD CONSTRAINT "transacao_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contrato"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrato" ADD CONSTRAINT "contrato_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrato" ADD CONSTRAINT "contrato_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aditivo" ADD CONSTRAINT "aditivo_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aditivo" ADD CONSTRAINT "aditivo_transacao_id_fkey" FOREIGN KEY ("transacao_id") REFERENCES "transacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
