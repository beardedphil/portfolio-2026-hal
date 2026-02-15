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

// Plugin to exclude CLI files from being processed
function excludeCliFilesPlugin() {
  return {
    name: 'exclude-cli-files',
    enforce: 'pre' as const,
    resolveId(id: string) {
      // Exclude CLI files that cause build errors
      if (id.includes('/bin/') || id.endsWith('/cli.js') || id.includes('/dist/cli.js') || id.includes('/dist/bin/')) {
        return { id, external: true }
      }
      return null
    },
  }
}

export default defineConfig({
  build: {
    cssMinify: false,
    rollupOptions: {
      input: 'index.html', // Explicitly specify entry point
      onwarn(warning, warn) {
        // Suppress warnings about CLI files
        if (warning.message && (warning.message.includes('/bin/') || warning.message.includes('/cli.js'))) {
          return
        }
        warn(warning)
      },
    },
    // Exclude scripts and node_modules from build
    outDir: 'dist',
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
  // Skip dependency optimization during build to avoid processing CLI files
  // optimizeDeps is only used in dev mode, not during build
  plugins: [
    excludeCliFilesPlugin(),
    react(),
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
