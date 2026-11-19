import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    // Evita que o watcher tente observar arquivos temporários/artefatos
    // (ex.: backups do Prisma em tmp/ e logs) e caia com EBUSY.
    watch: {
      ignored: [
        '**/.git/**',
        '**/node_modules/**',
        '**/dist/**',
        '**/tmp/**',
        '**/*.log',
        '**/*.tsbuildinfo',
        // Arquivos temporários criados por editores/ferramentas durante o save.
        '**/.*tmpdir/**',
        '**/*.tmp',
      ],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
})
