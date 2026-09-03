import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Porta padrão 5174 (evita 5173, default do Vite). Configurável por VITE_PORT.
const port = Number(process.env.VITE_PORT ?? 5174);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port, strictPort: false },
  preview: { port },
  // `.env` fica na RAIZ do monorepo (mesmo arquivo que o backend lê). Assim
  // `VITE_API_BASE_URL`, `VITE_PORT` etc. vêm de um único lugar.
  envDir: resolve(__dirname, '..'),
});
