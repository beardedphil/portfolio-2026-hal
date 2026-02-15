import path from 'path'
import { spawn } from 'child_process'
import type { Plugin } from 'vite'

/**
 * Pre-build hal-agents at dev server start so first /api/pm/check-unassigned is fast
 * (avoids "Failed to fetch" from long build)
 */
export function prebuildPlugin(): Plugin {
  return {
    name: 'hal-agents-prebuild',
    configureServer() {
      const repoRoot = path.resolve(__dirname, '../..')
      spawn('npm', ['run', 'build:agents'], { cwd: repoRoot, stdio: ['ignore', 'ignore', 'ignore'] }).on('error', () => {})
    },
  }
}
