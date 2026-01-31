/**
 * Repo write runner (0022): run agent-driven repo writes in an isolated worktree
 * so the user's main working tree is never modified.
 *
 * Usage: node scripts/repo-write-runner.js <repoRoot> <ticketId> <filename> <filePathRelative>
 * Env: SUPABASE_URL, SUPABASE_ANON_KEY
 *
 * - Creates branch ticket/<id>-<slug> in a new worktree
 * - Runs sync-tickets with PROJECT_ROOT=worktree (writes only in worktree)
 * - Stages only the given file path
 * - Commits with subject "Add ticket <id> (<slug>)"
 * - Pushes the branch
 * - Removes the worktree
 *
 * Outputs JSON to stdout: { success, branch?, stagedPaths?, commitSha?, error? }
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function out(obj) {
  console.log(JSON.stringify(obj))
}

function git(repoRoot, args, opts = {}) {
  const r = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    ...opts,
  })
  return { ...r, ok: r.status === 0 }
}

function main() {
  const [repoRoot, ticketId, filename, filePathRelative] = process.argv.slice(2)
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY

  if (!repoRoot || !ticketId || !filename || !filePathRelative) {
    out({ success: false, error: 'Usage: node repo-write-runner.js <repoRoot> <ticketId> <filename> <filePathRelative>' })
    process.exit(1)
  }
  if (!supabaseUrl || !supabaseAnonKey) {
    out({ success: false, error: 'SUPABASE_URL and SUPABASE_ANON_KEY must be set' })
    process.exit(1)
  }

  const resolvedRoot = path.resolve(repoRoot)
  const syncScriptPath = path.resolve(resolvedRoot, 'scripts', 'sync-tickets.js')
  if (!fs.existsSync(syncScriptPath)) {
    out({ success: false, error: 'sync-tickets.js not found at ' + syncScriptPath })
    process.exit(1)
  }

  // 1) Check we're in a git repo
  const revParse = git(resolvedRoot, ['rev-parse', '--is-inside-work-tree'])
  if (!revParse.ok || revParse.stdout?.trim() !== 'true') {
    out({ success: false, error: 'Not a git repository or git unavailable: ' + (revParse.stderr || revParse.error?.message || 'unknown') })
    process.exit(1)
  }

  const slug = filename.replace(/\.md$/i, '')
  const branch = `ticket/${ticketId}-${slug}`
  const worktreePath = path.join(resolvedRoot, '.hal-agent-write-' + ticketId)

  const cleanupWorktree = () => {
    if (!fs.existsSync(worktreePath)) return
    const wtList = spawnSync('git', ['worktree', 'list'], { cwd: resolvedRoot, encoding: 'utf8' })
    if (wtList.stdout && wtList.stdout.includes(worktreePath)) {
      spawnSync('git', ['worktree', 'remove', worktreePath, '--force'], { cwd: resolvedRoot })
    }
    if (fs.existsSync(worktreePath)) {
      try {
        fs.rmSync(worktreePath, { recursive: true, force: true })
      } catch (_) {}
    }
  }

  // 2) Resolve base ref (main or origin/main)
  let baseRef = 'main'
  if (!git(resolvedRoot, ['rev-parse', '--verify', 'main']).ok) {
    if (git(resolvedRoot, ['rev-parse', '--verify', 'origin/main']).ok) {
      baseRef = 'origin/main'
    }
  }

  // 3) Remove leftover worktree dir if present
  cleanupWorktree()

  // 4) Create worktree with new branch
  const addWt = git(resolvedRoot, ['worktree', 'add', '-b', branch, worktreePath, baseRef])
  if (!addWt.ok) {
    const err = (addWt.stderr || addWt.error?.message || 'unknown').trim().slice(0, 500)
    out({ success: false, error: 'Failed to create worktree/branch: ' + err })
    process.exit(1)
  }

  let result = { success: false, branch, stagedPaths: [filePathRelative] }
  try {
    // 5) Run sync-tickets in worktree (writes to worktree only)
    const sync = spawnSync('node', [syncScriptPath], {
      cwd: worktreePath,
      env: {
        ...process.env,
        PROJECT_ROOT: worktreePath,
        SUPABASE_URL: supabaseUrl,
        SUPABASE_ANON_KEY: supabaseAnonKey,
      },
      encoding: 'utf8',
    })
    if (sync.status !== 0) {
      const err = (sync.stderr || sync.stdout || 'sync-tickets failed').trim().slice(0, 500)
      out({ ...result, error: 'sync-tickets failed: ' + err })
      cleanupWorktree()
      process.exit(1)
    }

    // 6) Stage only the ticket file
    const addFile = git(worktreePath, ['add', '--', filePathRelative])
    if (!addFile.ok) {
      out({ ...result, error: 'git add failed: ' + (addFile.stderr || '').trim().slice(0, 300) })
      cleanupWorktree()
      process.exit(1)
    }

    // 7) Commit with ticket ID in subject
    const commitMsg = `Add ticket ${ticketId} (${slug})`
    const commit = git(worktreePath, ['commit', '-m', commitMsg])
    if (!commit.ok) {
      out({ ...result, error: 'git commit failed: ' + (commit.stderr || '').trim().slice(0, 300) })
      cleanupWorktree()
      process.exit(1)
    }
    const revParseHead = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: worktreePath, encoding: 'utf8' })
    const commitSha = revParseHead.stdout?.trim() || undefined

    // 8) Push branch
    const pushResult = git(worktreePath, ['push', 'origin', branch])
    if (!pushResult.ok) {
      out({
        ...result,
        commitSha,
        error: 'git push failed: ' + (pushResult.stderr || '').trim().slice(0, 500),
      })
      cleanupWorktree()
      process.exit(1)
    }

    result = { success: true, branch, stagedPaths: [filePathRelative], commitSha }
    out(result)
  } finally {
    cleanupWorktree()
  }
  process.exit(0)
}

main()
