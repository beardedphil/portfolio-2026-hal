/**
 * Vercel build helper:
 * - Build in-repo agents (agents/dist) so serverless can load PM/runner
 * - Build Kanban library (projects/kanban dist-kanban-lib) for HAL import
 * - Build HAL (root Vite app) into dist/
 */

import { spawnSync } from 'child_process'

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
  console.log('[build-vercel] build:kanban')
  runNpm(['run', 'build:kanban'], { cwd: repoRoot })
  console.log('[build-vercel] build:hal')
  runNpm(['run', 'build:hal'], { cwd: repoRoot })
}

main()

