-- CreateEnum
CREATE TYPE "StatusTransacaoCanonico" AS ENUM ('PENDENTE', 'PAGO', 'EM_ATRASO', 'RECUSADO', 'CANCELADO', 'ESTORNADO', 'CHARGEBACK', 'DESCONHECIDO');

-- CreateTable
CREATE TABLE "transacao" (
    "id" UUID NOT NULL,
    "plataforma_origem" "PlataformaOrigem" NOT NULL,
    "id_origem" TEXT NOT NULL,
    "tipo_origem" TEXT NOT NULL,
    "status_origem" TEXT NOT NULL,
    "status_canonico" "StatusTransacaoCanonico" NOT NULL,
    "classificacao" "Classificacao" NOT NULL,
    "ocorrido_em" TIMESTAMPTZ(6),
    "pessoa_id" UUID,
    "oferta_id" UUID,
    "contrato_id" UUID,
    "transacao_vinculada_id" UUID,
    "valor_bruto_int" BIGINT,
    "valor_bruto_moeda" CHAR(3),
    "valor_liquido_int" BIGINT,
    "valor_liquido_moeda" CHAR(3),
    "taxas_int" BIGINT,
    "taxas_moeda" CHAR(3),
    "reembolso_int" BIGINT,
    "reembolso_moeda" CHAR(3),
    "quantidade" INTEGER,
    "eh_afiliada" BOOLEAN NOT NULL DEFAULT false,
    "eh_recorrencia" BOOLEAN NOT NULL DEFAULT false,
    "assinatura_ciclo" TEXT,
    "numero_ciclo" INTEGER,
    "oferta_codigo_origem" TEXT,
    "oferta_nome_origem" TEXT,
    "precisa_revisao" BOOLEAN NOT NULL DEFAULT false,
    "motivo_revisao" TEXT,
    "evento_origem_id" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "transacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transacao_status_canonico_idx" ON "transacao"("status_canonico");

-- CreateIndex
CREATE INDEX "transacao_classificacao_idx" ON "transacao"("classificacao");

-- CreateIndex
CREATE INDEX "transacao_pessoa_id_idx" ON "transacao"("pessoa_id");

-- CreateIndex
CREATE INDEX "transacao_plataforma_origem_idx" ON "transacao"("plataforma_origem");

-- CreateIndex
CREATE INDEX "transacao_ocorrido_em_idx" ON "transacao"("ocorrido_em");

-- CreateIndex
CREATE INDEX "transacao_precisa_revisao_idx" ON "transacao"("precisa_revisao");

-- CreateIndex
CREATE UNIQUE INDEX "transacao_plataforma_origem_id_origem_key" ON "transacao"("plataforma_origem", "id_origem");

-- AddForeignKey
ALTER TABLE "transacao" ADD CONSTRAINT "transacao_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacao" ADD CONSTRAINT "transacao_evento_origem_id_fkey" FOREIGN KEY ("evento_origem_id") REFERENCES "evento_origem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
