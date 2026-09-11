-- CreateEnum
CREATE TYPE "TurmaTipo" AS ENUM ('NUMERO', 'EVERGREEN', 'PERPETUO', 'DESCONHECIDO');

-- CreateEnum
CREATE TYPE "OfertaOrigemRefTipo" AS ENUM ('TAG', 'HOTMART_PRICE_CODE');

-- CreateTable
CREATE TABLE "produto" (
    "id" UUID NOT NULL,
    "codigo" CHAR(3) NOT NULL,
    "nome_curado" TEXT,
    "nome_derivado" TEXT,
    "assinatura_curada" BOOLEAN,
    "assinatura_derivada" BOOLEAN,
    "campos_editados" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "produto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oferta" (
    "id" UUID NOT NULL,
    "produto_id" UUID NOT NULL,
    "turma_tipo_curado" "TurmaTipo",
    "turma_numero_curado" INTEGER,
    "turma_tipo_derivado" "TurmaTipo",
    "turma_numero_derivado" INTEGER,
    "subproduto_codigo_curado" CHAR(1),
    "subproduto_codigo_derivado" CHAR(1),
    "modelo_cobranca_codigo_curado" CHAR(1),
    "modelo_cobranca_codigo_derivado" CHAR(1),
    "modelo_transacao_codigo_curado" CHAR(1),
    "modelo_transacao_codigo_derivado" CHAR(1),
    "campos_editados" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "oferta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oferta_origem_ref" (
    "id" UUID NOT NULL,
    "oferta_id" UUID NOT NULL,
    "plataforma_origem" "PlataformaOrigem" NOT NULL,
    "tipo_ref" "OfertaOrigemRefTipo" NOT NULL,
    "valor_ref" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oferta_origem_ref_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oferta_catalogo" (
    "id" UUID NOT NULL,
    "oferta_id" UUID NOT NULL,
    "ticket_int" BIGINT,
    "ticket_moeda" CHAR(3),
    "preco_tabela_int" BIGINT,
    "preco_tabela_moeda" CHAR(3),
    "tempo_acesso_dias" INTEGER,
    "combo" BOOLEAN NOT NULL DEFAULT false,
    "lancamento" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "oferta_catalogo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oferta_catalogo_bonus" (
    "id" UUID NOT NULL,
    "oferta_catalogo_id" UUID NOT NULL,
    "descricao" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "oferta_catalogo_bonus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oferta_catalogo_combo_item" (
    "id" UUID NOT NULL,
    "oferta_catalogo_id" UUID NOT NULL,
    "produto_id" UUID NOT NULL,

    CONSTRAINT "oferta_catalogo_combo_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "janela_lancamento" (
    "id" UUID NOT NULL,
    "produto_id" UUID NOT NULL,
    "rotulo" TEXT NOT NULL,
    "inicio" DATE NOT NULL,
    "fim" DATE NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "janela_lancamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalogo_audit" (
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

    CONSTRAINT "catalogo_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "produto_codigo_key" ON "produto"("codigo");

-- CreateIndex
CREATE INDEX "oferta_produto_id_idx" ON "oferta"("produto_id");

-- CreateIndex
CREATE INDEX "oferta_origem_ref_oferta_id_idx" ON "oferta_origem_ref"("oferta_id");

-- CreateIndex
CREATE UNIQUE INDEX "oferta_origem_ref_plataforma_origem_tipo_ref_valor_ref_key" ON "oferta_origem_ref"("plataforma_origem", "tipo_ref", "valor_ref");

-- CreateIndex
CREATE UNIQUE INDEX "oferta_catalogo_oferta_id_key" ON "oferta_catalogo"("oferta_id");

-- CreateIndex
CREATE INDEX "oferta_catalogo_bonus_oferta_catalogo_id_idx" ON "oferta_catalogo_bonus"("oferta_catalogo_id");

-- CreateIndex
CREATE UNIQUE INDEX "oferta_catalogo_combo_item_oferta_catalogo_id_produto_id_key" ON "oferta_catalogo_combo_item"("oferta_catalogo_id", "produto_id");

-- CreateIndex
CREATE INDEX "janela_lancamento_produto_id_idx" ON "janela_lancamento"("produto_id");

-- CreateIndex
CREATE UNIQUE INDEX "janela_lancamento_produto_id_rotulo_key" ON "janela_lancamento"("produto_id", "rotulo");

-- CreateIndex
CREATE INDEX "catalogo_audit_entidade_entidade_id_idx" ON "catalogo_audit"("entidade", "entidade_id");

-- AddForeignKey
ALTER TABLE "transacao" ADD CONSTRAINT "transacao_oferta_id_fkey" FOREIGN KEY ("oferta_id") REFERENCES "oferta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oferta" ADD CONSTRAINT "oferta_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oferta_origem_ref" ADD CONSTRAINT "oferta_origem_ref_oferta_id_fkey" FOREIGN KEY ("oferta_id") REFERENCES "oferta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oferta_catalogo" ADD CONSTRAINT "oferta_catalogo_oferta_id_fkey" FOREIGN KEY ("oferta_id") REFERENCES "oferta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oferta_catalogo_bonus" ADD CONSTRAINT "oferta_catalogo_bonus_oferta_catalogo_id_fkey" FOREIGN KEY ("oferta_catalogo_id") REFERENCES "oferta_catalogo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oferta_catalogo_combo_item" ADD CONSTRAINT "oferta_catalogo_combo_item_oferta_catalogo_id_fkey" FOREIGN KEY ("oferta_catalogo_id") REFERENCES "oferta_catalogo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oferta_catalogo_combo_item" ADD CONSTRAINT "oferta_catalogo_combo_item_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "janela_lancamento" ADD CONSTRAINT "janela_lancamento_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
