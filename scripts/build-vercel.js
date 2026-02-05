/**
 * Vercel build helper:
 * - Build hal-agents (so serverless imports can load dist)
 * - Build HAL (root Vite app) into dist/
 * - Build Kanban (projects/kanban) and copy into dist/kanban-app/
 */

import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'

function run(cmd, args, opts = {}) {
  // IMPORTANT: do not use `shell: true` on Windows here; it breaks paths with spaces.
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

function rmIfExists(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true })
}

function main() {
  const repoRoot = process.cwd()

  runNpm(['run', 'build:agents'], { cwd: repoRoot })
  runNpm(['run', 'build:hal'], { cwd: repoRoot })
  runNpm(['run', 'build:kanban'], { cwd: repoRoot })

  const from = path.join(repoRoot, 'projects', 'kanban', 'dist')
  const to = path.join(repoRoot, 'dist', 'kanban-app')
  rmIfExists(to)
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.cpSync(from, to, { recursive: true })
}

main()

