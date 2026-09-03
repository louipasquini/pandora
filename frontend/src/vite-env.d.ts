/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base da API interna que o painel consome (spec 003). Default `http://localhost:3001`. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
