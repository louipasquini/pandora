-- CreateEnum
CREATE TYPE "TemplateWhatsappCategoria" AS ENUM ('MARKETING', 'UTILITY', 'AUTHENTICATION');

-- CreateEnum
CREATE TYPE "TemplateWhatsappStatus" AS ENUM ('PENDENTE', 'APROVADO', 'REJEITADO', 'PAUSADO', 'DESABILITADO');

-- CreateEnum
CREATE TYPE "MensagemWhatsappTipoConteudo" AS ENUM ('TEXTO', 'IMAGEM', 'AUDIO', 'DOCUMENTO', 'VIDEO', 'OUTRO');

-- CreateEnum
CREATE TYPE "MensagemWhatsappStatusEntrega" AS ENUM ('RECEBIDA', 'ENVIADA', 'ENTREGUE', 'LIDA', 'FALHOU');

-- CreateEnum
CREATE TYPE "EventoWebhookWhatsappStatus" AS ENUM ('PENDENTE', 'PROCESSADO', 'ERRO');

-- CreateEnum
CREATE TYPE "OptOutWhatsappOrigem" AS ENUM ('PROPRIO_NUMERO', 'ATENDENTE');

-- CreateTable
CREATE TABLE "canal_whatsapp" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "numero_telefone" TEXT NOT NULL,
    "waba_id" TEXT NOT NULL,
    "phone_number_id" TEXT NOT NULL,
    "access_token_cifrado" TEXT NOT NULL,
    "access_token_ultimos4" TEXT NOT NULL,
    "app_secret_cifrado" TEXT NOT NULL,
    "app_secret_ultimos4" TEXT NOT NULL,
    "webhook_verify_token_cifrado" TEXT NOT NULL,
    "webhook_verify_token_ultimos4" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultimo_webhook_recebido_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "canal_whatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_whatsapp" (
    "id" UUID NOT NULL,
    "canal_id" UUID NOT NULL,
    "nome_meta" TEXT NOT NULL,
    "idioma" TEXT NOT NULL,
    "categoria" "TemplateWhatsappCategoria" NOT NULL,
    "corpo" TEXT NOT NULL,
    "status_aprovacao" "TemplateWhatsappStatus" NOT NULL,
    "motivo_rejeicao" TEXT,
    "sincronizado_em" TIMESTAMPTZ(6) NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "template_whatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagem_whatsapp" (
    "id" UUID NOT NULL,
    "interacao_id" UUID NOT NULL,
    "canal_id" UUID NOT NULL,
    "template_id" UUID,
    "wa_message_id" TEXT,
    "tipo_conteudo" "MensagemWhatsappTipoConteudo" NOT NULL DEFAULT 'TEXTO',
    "midia_id_externo" TEXT,
    "status_entrega" "MensagemWhatsappStatusEntrega" NOT NULL,
    "erro_detalhe" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mensagem_whatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evento_webhook_whatsapp" (
    "id" UUID NOT NULL,
    "canal_id" UUID,
    "payload_bruto" JSONB NOT NULL,
    "hash" TEXT NOT NULL,
    "recebido_em" TIMESTAMPTZ(6) NOT NULL,
    "status" "EventoWebhookWhatsappStatus" NOT NULL DEFAULT 'PENDENTE',
    "erro_detalhe" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evento_webhook_whatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opt_out_whatsapp" (
    "id" UUID NOT NULL,
    "telefone" TEXT NOT NULL,
    "pessoa_id" UUID,
    "lead_id" UUID,
    "origem" "OptOutWhatsappOrigem" NOT NULL,
    "optado_em" TIMESTAMPTZ(6) NOT NULL,
    "revertido_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "opt_out_whatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "canal_whatsapp_ativo_idx" ON "canal_whatsapp"("ativo");

-- CreateIndex
CREATE UNIQUE INDEX "canal_whatsapp_phone_number_id_key" ON "canal_whatsapp"("phone_number_id");

-- CreateIndex
CREATE INDEX "template_whatsapp_canal_id_status_aprovacao_idx" ON "template_whatsapp"("canal_id", "status_aprovacao");

-- CreateIndex
CREATE UNIQUE INDEX "template_whatsapp_canal_id_nome_meta_idioma_key" ON "template_whatsapp"("canal_id", "nome_meta", "idioma");

-- CreateIndex
CREATE UNIQUE INDEX "mensagem_whatsapp_interacao_id_key" ON "mensagem_whatsapp"("interacao_id");

-- CreateIndex
CREATE INDEX "mensagem_whatsapp_canal_id_idx" ON "mensagem_whatsapp"("canal_id");

-- CreateIndex
CREATE INDEX "mensagem_whatsapp_template_id_idx" ON "mensagem_whatsapp"("template_id");

-- CreateIndex
CREATE INDEX "evento_webhook_whatsapp_status_recebido_em_idx" ON "evento_webhook_whatsapp"("status", "recebido_em");

-- CreateIndex
CREATE UNIQUE INDEX "evento_webhook_whatsapp_hash_key" ON "evento_webhook_whatsapp"("hash");

-- CreateIndex
CREATE INDEX "opt_out_whatsapp_telefone_optado_em_idx" ON "opt_out_whatsapp"("telefone", "optado_em");

-- AddForeignKey
ALTER TABLE "template_whatsapp" ADD CONSTRAINT "template_whatsapp_canal_id_fkey" FOREIGN KEY ("canal_id") REFERENCES "canal_whatsapp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagem_whatsapp" ADD CONSTRAINT "mensagem_whatsapp_interacao_id_fkey" FOREIGN KEY ("interacao_id") REFERENCES "interacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagem_whatsapp" ADD CONSTRAINT "mensagem_whatsapp_canal_id_fkey" FOREIGN KEY ("canal_id") REFERENCES "canal_whatsapp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagem_whatsapp" ADD CONSTRAINT "mensagem_whatsapp_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "template_whatsapp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_webhook_whatsapp" ADD CONSTRAINT "evento_webhook_whatsapp_canal_id_fkey" FOREIGN KEY ("canal_id") REFERENCES "canal_whatsapp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opt_out_whatsapp" ADD CONSTRAINT "opt_out_whatsapp_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opt_out_whatsapp" ADD CONSTRAINT "opt_out_whatsapp_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Índice único PARCIAL: `wa_message_id` (id da mensagem na Meta) só é único
-- quando presente — usado para localizar a mensagem ao receber um callback de
-- status (`statuses[]` do webhook). Prisma não modela índice parcial.
CREATE UNIQUE INDEX "mensagem_whatsapp_wa_message_id_key"
  ON "mensagem_whatsapp" ("wa_message_id")
  WHERE "wa_message_id" IS NOT NULL;
