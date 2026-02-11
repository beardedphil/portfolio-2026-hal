/**
 * Vercel build helper:
 * - Build hal-agents package (linked via file:../portfolio-2026-hal-agents) so serverless can load dist
 * - Build HAL (root Vite app) into dist/
 * Kanban is embedded as library (portfolio-2026-kanban); no separate Kanban app build.
 */

import { spawnSync } from 'child_process'
import path from 'path'

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: false, ...opts })
  if (r.error) {
    throw new Error(`Command error: ${cmd} ${args.join(' ')} — ${r.error.message}`)
  }
  if (r.status !== 0) {
    throw new Error(`Command failed (${r.status}): ${cmd} ${args.join(' ')}`)
  }
}

function runNpm(args, opts = {}) {
  const npmExecPath = process.env.npm_execpath
  if (!npmExecPath) {
    throw new Error('npm_execpath is not set; expected build to run under npm.')
  }
  run(process.execPath, [npmExecPath, ...args], opts)
}

function main() {
  const repoRoot = process.cwd()

  console.log('[build-vercel] build:agents')
  runNpm(['run', 'build:agents'], { cwd: repoRoot })
  console.log('[build-vercel] build:hal')
  runNpm(['run', 'build:hal'], { cwd: repoRoot })
}

main()

