-- CreateEnum
CREATE TYPE "EventoOrigemStatus" AS ENUM ('pendente', 'ok', 'erro', 'revisar');

-- CreateEnum
CREATE TYPE "EventoEtapaStatus" AS ENUM ('pendente', 'processando', 'ok', 'erro', 'bloqueada', 'pulada');

-- CreateEnum
CREATE TYPE "EtapaIngestao" AS ENUM ('REGISTRAR', 'CLASSIFICAR', 'RESOLVER_PESSOA', 'UPSERT_TRANSACAO', 'RESOLVER_VINCULO', 'RESOLVER_OFERTA', 'PROJETAR_CONTRATO');

-- CreateEnum
CREATE TYPE "Classificacao" AS ENUM ('VENDA_PROPRIA', 'VENDA_AFILIADA', 'COBRANCA_TERCEIRIZADA', 'REEMBOLSO', 'RECORRENCIA', 'OUTRO', 'DESCONHECIDO');

-- CreateTable
CREATE TABLE "evento_origem" (
    "id" UUID NOT NULL,
    "plataforma_origem" "PlataformaOrigem" NOT NULL,
    "id_origem" TEXT NOT NULL,
    "tipo_origem" TEXT NOT NULL,
    "payload_bruto" JSONB NOT NULL,
    "evento_canonico" JSONB,
    "hash" TEXT NOT NULL,
    "recebido_em" TIMESTAMPTZ(6) NOT NULL,
    "ultimo_recebido_em" TIMESTAMPTZ(6) NOT NULL,
    "reentregas" INTEGER NOT NULL DEFAULT 0,
    "status" "EventoOrigemStatus" NOT NULL DEFAULT 'pendente',
    "classificacao" "Classificacao",
    "erro_detalhe" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "evento_origem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evento_etapa" (
    "id" UUID NOT NULL,
    "evento_origem_id" UUID NOT NULL,
    "etapa" "EtapaIngestao" NOT NULL,
    "status" "EventoEtapaStatus" NOT NULL DEFAULT 'pendente',
    "resultado" JSONB,
    "erro_detalhe" TEXT,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "executado_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "evento_etapa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestao_audit" (
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

    CONSTRAINT "ingestao_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evento_origem_status_recebido_em_idx" ON "evento_origem"("status", "recebido_em");

-- CreateIndex
CREATE INDEX "evento_origem_plataforma_origem_idx" ON "evento_origem"("plataforma_origem");

-- CreateIndex
CREATE INDEX "evento_origem_classificacao_idx" ON "evento_origem"("classificacao");

-- CreateIndex
CREATE UNIQUE INDEX "evento_origem_plataforma_origem_id_origem_hash_key" ON "evento_origem"("plataforma_origem", "id_origem", "hash");

-- CreateIndex
CREATE INDEX "evento_etapa_status_idx" ON "evento_etapa"("status");

-- CreateIndex
CREATE UNIQUE INDEX "evento_etapa_evento_origem_id_etapa_key" ON "evento_etapa"("evento_origem_id", "etapa");

-- CreateIndex
CREATE INDEX "ingestao_audit_entidade_entidade_id_idx" ON "ingestao_audit"("entidade", "entidade_id");

-- AddForeignKey
ALTER TABLE "evento_etapa" ADD CONSTRAINT "evento_etapa_evento_origem_id_fkey" FOREIGN KEY ("evento_origem_id") REFERENCES "evento_origem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
