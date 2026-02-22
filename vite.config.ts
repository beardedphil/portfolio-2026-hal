import path from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { config as loadEnv } from 'dotenv'

// ESM-safe __dirname for --configLoader runner (and native)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
  agentRunsSyncArtifactsPlugin,
  pmAgentLaunchPlugin,
  pmRespondPlugin,
  processReviewLaunchPlugin,
  processReviewRunPlugin,
  processReviewCreateTicketsPlugin,
  ticketsCreateFromSuggestionPlugin,
  ticketsCheckFailureEscalationPlugin,
  conversationsWorkingMemoryGetPlugin,
  conversationsWorkingMemoryUpdatePlugin,
  acceptanceCriteriaStatusGetPlugin,
  acceptanceCriteriaStatusUpdatePlugin,
} from './vite/middleware/simple-handlers'
import { pmCheckUnassignedPlugin } from './vite/middleware/pm-check-unassigned'
import { pmFileAccessPlugin } from './vite/middleware/pm-file-access'
import { serveCoveragePlugin } from './vite/middleware/serve-coverage'

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
    // This must run early to prevent esbuild from processing JSX in .js files
    {
      name: 'exclude-istanbul-reports',
      enforce: 'pre', // Run before other plugins
      buildStart() {
        // Mark istanbul-reports as external at build start
      },
      resolveId(id, importer) {
        // Intercept any resolve of istanbul-reports files
        if (id.includes('istanbul-reports')) {
          // Return a virtual module that won't be processed
          return { id: `\0virtual:istanbul-reports-${id.replace(/[^a-z0-9]/gi, '_')}`, external: false }
        }
      },
      load(id) {
        // Return empty module for any istanbul-reports virtual modules
        if (id.startsWith('\0virtual:istanbul-reports-')) {
          return 'export {}'
        }
        // Also catch direct imports
        if (id.includes('istanbul-reports')) {
          return 'export {}'
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
    agentRunsSyncArtifactsPlugin(),
    pmCheckUnassignedPlugin(),
    pmFileAccessPlugin(),
    pmAgentLaunchPlugin(),
    pmRespondPlugin(),
    processReviewLaunchPlugin(),
    processReviewRunPlugin(),
    processReviewCreateTicketsPlugin(),
    ticketsCreateFromSuggestionPlugin(),
    ticketsCheckFailureEscalationPlugin(),
    conversationsWorkingMemoryGetPlugin(),
    conversationsWorkingMemoryUpdatePlugin(),
    acceptanceCriteriaStatusGetPlugin(),
    acceptanceCriteriaStatusUpdatePlugin(),
    serveCoveragePlugin(),
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
