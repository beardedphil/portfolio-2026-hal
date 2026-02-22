import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import type { Plugin } from 'vite'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Plugin to force React and React DOM to resolve from root node_modules
const reactDedupePlugin = (): Plugin => {
  const rootReact = resolve(__dirname, 'node_modules/react')
  const rootReactDom = resolve(__dirname, 'node_modules/react-dom')
  
  return {
    name: 'react-dedupe',
    enforce: 'pre',
    resolveId(id, importer) {
      // Only intercept if importing from kanban project
      if (importer && importer.includes('projects/kanban')) {
        if (id === 'react') {
          return { id: rootReact, external: false }
        }
        if (id === 'react-dom') {
          return { id: rootReactDom, external: false }
        }
      }
      return null
    },
  }
}

export default defineConfig(({ mode }) => {
  // Load env vars from .env files (same as Vite does)
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    root: __dirname,
    plugins: [reactDedupePlugin(), react()],
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        'react': resolve(__dirname, 'node_modules/react'),
        'react-dom': resolve(__dirname, 'node_modules/react-dom'),
      },
      // Prefer root node_modules over project-specific node_modules
      preserveSymlinks: false,
    },
    // Exclude kanban project's node_modules from optimization to force root resolution
    optimizeDeps: {
      exclude: ['projects/kanban/node_modules/react', 'projects/kanban/node_modules/react-dom'],
      include: ['react', 'react-dom'],
      force: true,
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      // Exclude integration tests that require Supabase credentials
      // These are designed to be run standalone with: npx tsx api/artifacts/insert-*.test.ts
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/e2e/**', // Playwright tests; run via `npm run test:e2e`
        '**/api/artifacts/insert-*.test.ts', // Integration tests requiring Supabase
        '**/.test-backup/**', // Backup test files that should not be run
      ],
      // Pass env vars to test environment (for tests that need them)
      env: {
        SUPABASE_URL: env.SUPABASE_URL || env.VITE_SUPABASE_URL || '',
        SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '',
        VITE_SUPABASE_URL: env.VITE_SUPABASE_URL || '',
        VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY || '',
      },
      coverage: {
        provider: 'v8',
        reporter: ['text', 'text-summary', 'json-summary'],
        include: ['src/**/*.{ts,tsx}', 'api/**/*.ts', 'agents/**/*.ts', 'projects/**/*.{ts,tsx}'],
        exclude: [
          '**/node_modules/**',
          '**/dist/**',
          '**/*.test.ts',
          '**/*.test.tsx',
          '**/test/**',
          '**/test-setup.ts',
          '**/setup.ts',
          '**/vitest.config.ts',
          '**/vite.config.ts',
          '**/*.md',
          '**/*.json',
          '**/hal-template/**',
        ],
        thresholds: {
          lines: 25,
          statements: 25,
          branches: 25,
          functions: 25,
        },
      },
    },
  }
})
