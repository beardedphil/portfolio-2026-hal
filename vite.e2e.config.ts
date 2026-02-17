import path from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Minimal Vite config for Playwright E2E.
 *
 * This avoids loading HAL's full dev-server middleware stack (which includes
 * dynamic imports and Node-only routes) and serves only static HTML + React.
 */
export default defineConfig({
  root: '.',
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: 'portfolio-2026-kanban/style.css',
        replacement: path.resolve(__dirname, 'projects/kanban/src/index.css'),
      },
      {
        find: 'portfolio-2026-kanban',
        replacement: path.resolve(__dirname, 'projects/kanban/src/entry-lib.tsx'),
      },
    ],
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    exclude: ['istanbul-reports', 'node-domexception', 'rxjs'],
  },
  server: {
    port: 4173,
    strictPort: true,
  },
})

