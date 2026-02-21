import path from 'path'
import { spawn } from 'child_process'
import type { Plugin } from 'vite'
import { fileURLToPath } from 'url'

// ESM-safe __dirname for Vite configLoader runner
const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Pre-build hal-agents at dev server start so first /api/pm/check-unassigned is fast */
export function prebuildPlugin(): Plugin {
  return {
    name: 'hal-agents-prebuild',
    configureServer() {
      const repoRoot = path.resolve(__dirname, '../..')
      const p = spawn('npm', ['run', 'build:agents'], { cwd: repoRoot, stdio: 'inherit' })
      p.on('error', (err) => {
        console.warn('[prebuild] build:agents spawn failed:', err instanceof Error ? err.message : String(err))
      })
      p.on('exit', (code) => {
        if (code !== 0) console.warn(`[prebuild] build:agents exited with code ${code}. PM agent may run with stale agents/dist.`)
      })
    },
  }
}
