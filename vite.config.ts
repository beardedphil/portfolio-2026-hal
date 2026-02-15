import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { config as loadEnv } from 'dotenv'

// Load .env so OPENAI_API_KEY / OPENAI_MODEL are available in server middleware
loadEnv()

// Helper modules
import { prebuildPlugin } from './vite/middleware/prebuild'
import { pmWorkingMemoryGetPlugin, pmRefreshWorkingMemoryPlugin } from './vite/middleware/pm-working-memory'
import { pmWorkingMemoryRefreshPlugin } from './vite/middleware/pm-working-memory-refresh'
import { implementationAgentPlugin } from './vite/middleware/implementation-agent'
import { qaAgentPlugin } from './vite/middleware/qa-agent'
import { ticketsDeletePlugin, ticketsUpdatePlugin } from './vite/middleware/tickets'
import {
  agentToolsExecutePlugin,
  instructionsMigrateDocsPlugin,
  artifactsGetPlugin,
  artifactsCleanupDuplicatesPlugin,
  agentRunsLaunchPlugin,
  agentRunsStatusPlugin,
  agentRunsCancelPlugin,
  agentRunsSyncArtifactsPlugin,
  pmAgentLaunchPlugin,
  processReviewLaunchPlugin,
  processReviewRunPlugin,
  processReviewCreateTicketsPlugin,
  ticketsCreateFromSuggestionPlugin,
  ticketsCheckFailureEscalationPlugin,
  conversationsWorkingMemoryGetPlugin,
  conversationsWorkingMemoryUpdatePlugin,
} from './vite/middleware/simple-handlers'
import { pmCheckUnassignedPlugin } from './vite/middleware/pm-check-unassigned'
import { pmFileAccessPlugin } from './vite/middleware/pm-file-access'

export default defineConfig({
  build: {
    cssMinify: false,
    rollupOptions: {
      input: 'index.html',
      external: (id) => {
        // Mark CLI files, scripts, and problematic node_modules files as external
        if (
          id.includes('/bin/') ||
          id.endsWith('/cli.js') ||
          id.includes('/dist/cli.js') ||
          id.includes('/dist/bin/') ||
          (id.includes('/scripts/') && id.endsWith('.js')) ||
          // Exclude problematic packages that cause build errors
          id.includes('istanbul-reports/') ||
          id.includes('node-domexception/.history/') ||
          id.includes('rxjs/src/Rx.global.js') ||
          // Exclude React Native specific files
          id.includes('.native.js') ||
          id.includes('nanoid/async/index.native') ||
          // Exclude test files
          id.includes('.test.ts') ||
          id.includes('.test.js') ||
          // Exclude vitest config files
          id.includes('vitest.config') ||
          id.includes('vitest/browser')
        ) {
          return true
        }
        return false
      },
    },
    outDir: 'dist',
    target: 'esnext',
  },
  esbuild: {
    // Configure esbuild to handle JSX in .js files
    jsx: 'automatic',
  },
  publicDir: 'public',
  root: '.',
  resolve: {
    alias: [
      { find: 'portfolio-2026-kanban/style.css', replacement: path.resolve(__dirname, 'projects/kanban/src/index.css') },
      { find: 'portfolio-2026-kanban', replacement: path.resolve(__dirname, 'projects/kanban/src/entry-lib.tsx') },
      { find: '@hal-agents', replacement: path.resolve(__dirname, 'agents/src') },
    ],
    dedupe: [], // Don't dedupe dependencies
  },
  optimizeDeps: {
    // Exclude problematic packages from dependency optimization
    exclude: ['istanbul-reports', 'node-domexception', 'rxjs'],
  },
  plugins: [
    react(),
    // Plugin to exclude istanbul-reports from processing
    {
      name: 'exclude-istanbul-reports',
      resolveId(id) {
        if (id.includes('istanbul-reports')) {
          return { id: 'data:text/javascript,export {}', external: true }
        }
      },
      load(id) {
        if (id.includes('istanbul-reports')) {
          return 'export {}' // Return empty module to skip processing
        }
      },
    },
    prebuildPlugin(),
    pmWorkingMemoryGetPlugin(),
    pmRefreshWorkingMemoryPlugin(),
    pmWorkingMemoryRefreshPlugin(),
    implementationAgentPlugin(),
    qaAgentPlugin(),
    ticketsDeletePlugin(),
    ticketsUpdatePlugin(),
    agentToolsExecutePlugin(),
    instructionsMigrateDocsPlugin(),
    artifactsGetPlugin(),
    artifactsCleanupDuplicatesPlugin(),
    agentRunsLaunchPlugin(),
    agentRunsStatusPlugin(),
    agentRunsCancelPlugin(),
    agentRunsSyncArtifactsPlugin(),
    pmCheckUnassignedPlugin(),
    pmFileAccessPlugin(),
    pmAgentLaunchPlugin(),
    processReviewLaunchPlugin(),
    processReviewRunPlugin(),
    processReviewCreateTicketsPlugin(),
    ticketsCreateFromSuggestionPlugin(),
    ticketsCheckFailureEscalationPlugin(),
    conversationsWorkingMemoryGetPlugin(),
    conversationsWorkingMemoryUpdatePlugin(),
  ],
  server: {
    port: 5173,
    strictPort: true,
    // Kanban is embedded as library; no standalone dev server proxy.
    proxy: {},
    fs: {
      // Restrict file system access to prevent scanning everything
      allow: ['.'],
      deny: ['**/node_modules/**/bin/**', '**/node_modules/**/cli.js', '**/scripts/**'],
    },
  },
})
