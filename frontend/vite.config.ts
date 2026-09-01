import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Porta padrão 5174 (evita 5173, default do Vite). Configurável por VITE_PORT.
const port = Number(process.env.VITE_PORT ?? 5174);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port, strictPort: false },
  preview: { port },
});
