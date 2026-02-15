import path from 'path'
import { pathToFileURL } from 'url'

export type RunnerModule = {
  getSharedRunner?: () => {
    label: string
    run: (msg: string, config: object) => Promise<any>
  }
  summarizeForContext?: (msgs: unknown[], key: string, model: string) => Promise<string>
  generateWorkingMemory?: (
    msgs: unknown[],
    existing: unknown,
    key: string,
    model: string
  ) => Promise<unknown>
  extractWorkingMemory?: (
    msgs: unknown[],
    existing: unknown,
    key: string,
    model: string
  ) => Promise<unknown>
}

/**
 * Loads the hal-agents runner module from dist output.
 * Returns null if runner is not available.
 */
export async function loadRunnerModule(): Promise<RunnerModule | null> {
  const repoRoot = process.cwd()
  try {
    const runnerDistPath = path.resolve(repoRoot, 'agents/dist/agents/runner.js')
    const runnerModule = await import(pathToFileURL(runnerDistPath).href)
    return runnerModule as RunnerModule
  } catch {
    // If dist isn't present, we'll fall through and return null.
    return null
  }
}

/**
 * Gets the shared runner instance from the module.
 * Returns null if runner is not available.
 */
export function getRunner(runnerModule: RunnerModule | null): {
  label: string
  run: (msg: string, config: object) => Promise<any>
} | null {
  return runnerModule?.getSharedRunner?.() ?? null
}
