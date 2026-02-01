/**
 * Shared agent runner abstraction (0043).
 * Provides a small runner interface so the app can invoke agents (e.g. PM) via a
 * single abstraction that can later support both "Cursor App" and "Cursor API" backends.
 */

import {
  runPmAgent,
  summarizeForContext,
  type PmAgentConfig,
  type PmAgentResult,
} from './projectManager.js'

export { summarizeForContext }

/** Human-visible label for the runner implementation (e.g. shown in Diagnostics). */
export const SHARED_RUNNER_LABEL = 'v2 (shared)'

/**
 * Agent runner interface. Implementations run an agent (message + config → result)
 * and expose a label for diagnostics.
 */
export interface AgentRunner {
  readonly label: string
  run(message: string, config: PmAgentConfig): Promise<PmAgentResult>
}

/**
 * Returns the shared runner used by the Project Manager (and later Implementation Agent).
 * This runner executes agents in-process (hal-agents PM) and is labeled for UI verification.
 */
export function getSharedRunner(): AgentRunner {
  return {
    label: SHARED_RUNNER_LABEL,
    run: runPmAgent,
  }
}
