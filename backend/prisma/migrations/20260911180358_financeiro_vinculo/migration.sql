-- AlterTable
ALTER TABLE "transacao" ADD COLUMN     "referencia_externa_id_origem" TEXT;

-- CreateTable
CREATE TABLE "vinculo_transacao" (
    "id" UUID NOT NULL,
    "transacao_guru_id" UUID NOT NULL,
    "transacao_asaas_id" UUID NOT NULL,
    "origem_ref" TEXT NOT NULL,
    "resolvido_em" TIMESTAMPTZ(6) NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vinculo_transacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vinculo_transacao_transacao_guru_id_key" ON "vinculo_transacao"("transacao_guru_id");

-- CreateIndex
CREATE UNIQUE INDEX "vinculo_transacao_transacao_asaas_id_key" ON "vinculo_transacao"("transacao_asaas_id");

-- CreateIndex
CREATE INDEX "transacao_plataforma_origem_referencia_externa_id_origem_idx" ON "transacao"("plataforma_origem", "referencia_externa_id_origem");

-- AddForeignKey
ALTER TABLE "transacao" ADD CONSTRAINT "transacao_transacao_vinculada_id_fkey" FOREIGN KEY ("transacao_vinculada_id") REFERENCES "transacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vinculo_transacao" ADD CONSTRAINT "vinculo_transacao_transacao_guru_id_fkey" FOREIGN KEY ("transacao_guru_id") REFERENCES "transacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vinculo_transacao" ADD CONSTRAINT "vinculo_transacao_transacao_asaas_id_fkey" FOREIGN KEY ("transacao_asaas_id") REFERENCES "transacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
