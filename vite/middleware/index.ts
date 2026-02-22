import type { Plugin } from 'vite'
import { prebuildPlugin } from '../plugins/prebuild'
import { ticketsDeleteMiddleware } from './tickets-delete'
import { ticketsUpdateMiddleware } from './tickets-update'
import { createSimpleMiddlewarePlugin } from './helpers'

/**
 * Collects all Vite middleware plugins.
 * Each middleware plugin is extracted into its own module to keep vite.config.ts small.
 */
export function getAllMiddlewarePlugins(): Plugin[] {
  return [
    prebuildPlugin(),
    ticketsDeleteMiddleware(),
    ticketsUpdateMiddleware(),
    // Simple middleware that delegate to API handlers
    createSimpleMiddlewarePlugin('agent-tools-execute-endpoint', '/api/agent-tools/execute'),
    createSimpleMiddlewarePlugin('instructions-migrate-docs-endpoint', '/api/instructions/migrate-docs'),
    createSimpleMiddlewarePlugin('artifacts-get-endpoint', '/api/artifacts/get'),
    createSimpleMiddlewarePlugin('artifacts-cleanup-duplicates-endpoint', '/api/artifacts/cleanup-duplicates'),
    createSimpleMiddlewarePlugin('agent-runs-launch-endpoint', '/api/agent-runs/launch', { method: 'POST', allowOptions: false }),
    createSimpleMiddlewarePlugin('agent-runs-status-endpoint', '/api/agent-runs/status', { method: 'GET', allowOptions: false }),
    createSimpleMiddlewarePlugin('agent-runs-sync-artifacts-endpoint', '/api/agent-runs/sync-artifacts', { method: 'POST', allowOptions: false }),
    createSimpleMiddlewarePlugin('context-bundles-build-from-run-endpoint', '/api/context-bundles/build-from-run', { method: 'POST', allowOptions: false }),
    createSimpleMiddlewarePlugin('context-bundles-list-endpoint', '/api/context-bundles/list', { method: 'POST', allowOptions: false }),
    createSimpleMiddlewarePlugin('context-bundles-get-endpoint', '/api/context-bundles/get', { method: 'POST', allowOptions: false }),
    createSimpleMiddlewarePlugin('context-bundles-get-receipt-endpoint', '/api/context-bundles/get-receipt', { method: 'POST', allowOptions: false }),
    createSimpleMiddlewarePlugin('context-bundles-generate-endpoint', '/api/context-bundles/generate', { method: 'POST', allowOptions: false }),
    createSimpleMiddlewarePlugin('context-bundles-preview-endpoint', '/api/context-bundles/preview', { method: 'POST', allowOptions: false }),
    createSimpleMiddlewarePlugin('context-bundles-check-continuity-endpoint', '/api/context-bundles/check-continuity', { method: 'POST', allowOptions: false }),
    createSimpleMiddlewarePlugin('red-generate-endpoint', '/api/red/generate', { method: 'POST', allowOptions: false }),
    createSimpleMiddlewarePlugin('conversations-working-memory-get-endpoint', '/api/conversations/working-memory/get'),
    createSimpleMiddlewarePlugin('conversations-working-memory-update-endpoint', '/api/conversations/working-memory/update'),
    // TODO: Extract remaining complex middleware plugins:
    // - implementation-agent-endpoint
    // - qa-agent-endpoint
    // - pm-check-unassigned-endpoint
    // - pm-file-access-endpoint
    // - pm-working-memory-get-endpoint
    // - pm-refresh-working-memory-endpoint
    // - pm-working-memory-refresh-endpoint
  ]
}
