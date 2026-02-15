import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig(({ mode }) => {
  // Load env vars from .env files (same as Vite does)
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    plugins: [react()],
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      // Exclude integration tests that require Supabase credentials
      // These are designed to be run standalone with: npx tsx api/artifacts/insert-*.test.ts
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/api/artifacts/insert-*.test.ts', // Integration tests requiring Supabase
      ],
      // Pass env vars to test environment (for tests that need them)
      env: {
        SUPABASE_URL: env.SUPABASE_URL || env.VITE_SUPABASE_URL || '',
        SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '',
        VITE_SUPABASE_URL: env.VITE_SUPABASE_URL || '',
        VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY || '',
      },
    },
  }
})
