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

// Workaround for vite 7.x scanning node_modules during config loading
// The errors occur because vite uses esbuild to process this TypeScript config,
// and esbuild scans the workspace including problematic files (istanbul-reports JSX,
// node-domexception history, rxjs). These cannot be fixed via vite config since
// they happen before the config is loaded.
export default defineConfig({
  build: {
    cssMinify: false,
    rollupOptions: {
      input: 'index.html',
      external: (id) => {
        // Mark CLI files, scripts, and problematic node_modules files as external
        // This reduces errors from 54 to 16, but remaining errors occur during config loading
        if (
          id.includes('/bin/') ||
          id.endsWith('/cli.js') ||
          id.includes('/dist/cli.js') ||
          id.includes('/dist/bin/') ||
          (id.includes('/scripts/') && id.endsWith('.js'))
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
    // Configure esbuild to handle JSX in .js files (for istanbul-reports)
    // Note: This doesn't help during config loading, but helps during build
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
    exclude: [
      // Exclude problematic packages that cause build errors during config loading
      'istanbul-reports',
      'node-domexception',
      'rxjs',
    ],
  },
  plugins: [
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
