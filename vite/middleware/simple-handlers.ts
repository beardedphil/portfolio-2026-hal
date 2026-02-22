import type { Plugin } from 'vite'
import { readJsonBody } from '../helpers'

/** Helper to create a simple handler plugin that delegates to an API handler */
function createHandlerPlugin(name: string, path: string, method: string = 'POST'): Plugin {
  return {
    name,
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = req.url?.split('?')[0]
        if (pathname !== path || req.method !== method) {
          next()
          return
        }
        try {
          const handler = await import(`../../${path.replace('/api/', 'api/').replace(/\.js$/, '')}.js`)
          await handler.default(req, res)
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }))
        }
      })
    },
  }
}

/** Agent tools execute endpoint */
export function agentToolsExecutePlugin(): Plugin {
  return {
    name: 'agent-tools-execute-endpoint',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/api/agent-tools/execute' || (req.method !== 'POST' && req.method !== 'OPTIONS')) {
          next()
          return
        }

        // CORS: Allow cross-origin requests
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

        if (req.method === 'OPTIONS') {
          res.statusCode = 204
          res.end()
          return
        }

        try {
          const handler = await import('../../api/agent-tools/execute.js')
          await handler.default(req, res)
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              success: false,
              error: err instanceof Error ? err.message : String(err),
            })
          )
        }
      })
    },
  }
}

/** Instructions migrate docs endpoint */
export function instructionsMigrateDocsPlugin(): Plugin {
  return createHandlerPlugin('instructions-migrate-docs-endpoint', '/api/instructions/migrate-docs', 'POST')
}

/** Artifacts get endpoint */
export function artifactsGetPlugin(): Plugin {
  return createHandlerPlugin('artifacts-get-endpoint', '/api/artifacts/get', 'POST')
}

/** Artifacts cleanup duplicates endpoint */
export function artifactsCleanupDuplicatesPlugin(): Plugin {
  return createHandlerPlugin('artifacts-cleanup-duplicates-endpoint', '/api/artifacts/cleanup-duplicates', 'POST')
}

/** Agent runs launch endpoint */
export function agentRunsLaunchPlugin(): Plugin {
  return createHandlerPlugin('agent-runs-launch-endpoint', '/api/agent-runs/launch', 'POST')
}

/** Agent runs status endpoint */
export function agentRunsStatusPlugin(): Plugin {
  return {
    name: 'agent-runs-status-endpoint',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = req.url?.split('?')[0]
        if (pathname !== '/api/agent-runs/status' || req.method !== 'GET') {
          next()
          return
        }
        try {
          const handler = await import('../../api/agent-runs/status.js')
          await handler.default(req, res)
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
        }
      })
    },
  }
}

/** Agent runs sync artifacts endpoint */
export function agentRunsSyncArtifactsPlugin(): Plugin {
  return createHandlerPlugin('agent-runs-sync-artifacts-endpoint', '/api/agent-runs/sync-artifacts', 'POST')
}

/** PM agent launch endpoint */
export function pmAgentLaunchPlugin(): Plugin {
  return createHandlerPlugin('pm-agent-launch-endpoint', '/api/pm-agent/launch', 'POST')
}

/** PM respond endpoint (OpenAI Responses API) */
export function pmRespondPlugin(): Plugin {
  return createHandlerPlugin('pm-respond-endpoint', '/api/pm/respond', 'POST')
}

/** Process review launch endpoint */
export function processReviewLaunchPlugin(): Plugin {
  return createHandlerPlugin('process-review-launch-endpoint', '/api/process-review/launch', 'POST')
}

/** Process review run endpoint */
export function processReviewRunPlugin(): Plugin {
  return createHandlerPlugin('process-review-run-endpoint', '/api/process-review/run', 'POST')
}

/** Process review create tickets endpoint */
export function processReviewCreateTicketsPlugin(): Plugin {
  return createHandlerPlugin('process-review-create-tickets-endpoint', '/api/process-review/create-tickets', 'POST')
}

/** Tickets create from suggestion endpoint */
export function ticketsCreateFromSuggestionPlugin(): Plugin {
  return createHandlerPlugin('tickets-create-from-suggestion-endpoint', '/api/tickets/create-from-suggestion', 'POST')
}

/** Tickets check failure escalation endpoint */
export function ticketsCheckFailureEscalationPlugin(): Plugin {
  return createHandlerPlugin('tickets-check-failure-escalation-endpoint', '/api/tickets/check-failure-escalation', 'POST')
}

/** Conversations working memory get endpoint */
export function conversationsWorkingMemoryGetPlugin(): Plugin {
  return {
    name: 'conversations-working-memory-get-endpoint',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/api/conversations/working-memory/get' || (req.method !== 'POST' && req.method !== 'OPTIONS')) {
          next()
          return
        }
        try {
          const getHandler = await import('../../api/conversations/working-memory/get')
          await getHandler.default(req, res)
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              success: false,
              error: err instanceof Error ? err.message : String(err),
            })
          )
        }
      })
    },
  }
}

/** Conversations working memory update endpoint */
export function conversationsWorkingMemoryUpdatePlugin(): Plugin {
  return {
    name: 'conversations-working-memory-update-endpoint',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/api/conversations/working-memory/update' || (req.method !== 'POST' && req.method !== 'OPTIONS')) {
          next()
          return
        }
        try {
          const updateHandler = await import('../../api/conversations/working-memory/update')
          await updateHandler.default(req, res)
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              success: false,
              error: err instanceof Error ? err.message : String(err),
            })
          )
        }
      })
    },
  }
}

/** Acceptance criteria status get endpoint */
export function acceptanceCriteriaStatusGetPlugin(): Plugin {
  return {
    name: 'acceptance-criteria-status-get-endpoint',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/api/acceptance-criteria-status/get' || (req.method !== 'POST' && req.method !== 'OPTIONS')) {
          next()
          return
        }
        try {
          const getHandler = await import('../../api/acceptance-criteria-status/get')
          await getHandler.default(req, res)
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              success: false,
              error: err instanceof Error ? err.message : String(err),
            })
          )
        }
      })
    },
  }
}

/** Acceptance criteria status update endpoint */
export function acceptanceCriteriaStatusUpdatePlugin(): Plugin {
  return {
    name: 'acceptance-criteria-status-update-endpoint',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/api/acceptance-criteria-status/update' || (req.method !== 'POST' && req.method !== 'OPTIONS')) {
          next()
          return
        }
        try {
          const updateHandler = await import('../../api/acceptance-criteria-status/update')
          await updateHandler.default(req, res)
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              success: false,
              error: err instanceof Error ? err.message : String(err),
            })
          )
        }
      })
    },
  }
}

/** GitHub ensure initialized endpoint */
export function githubEnsureInitializedPlugin(): Plugin {
  return createHandlerPlugin('github-ensure-initialized-endpoint', '/api/github/ensure-initialized', 'POST')
}
