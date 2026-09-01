import { Module } from '@nestjs/common';

/**
 * `catalogo` — `produto`, `oferta`, `oferta_catalogo`, `janela_lancamento` e a
 * resolução de oferta (tag AEN / hotmart_code / offer.code). Vazio na spec 001;
 * preenchido na spec 023 (catalogo-produto-oferta).
 */
@Module({})
export class CatalogoModule {}
