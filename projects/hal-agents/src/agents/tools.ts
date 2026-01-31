/**
 * Read-only tools for PM agent: list_directory, read_file, search_files.
 * All paths are sandboxed to repoRoot.
 */

import fs from 'fs/promises'
import path from 'path'
import { sandboxPath } from '../utils/sandbox.js'

const MAX_FILE_LINES = 500
const DEFAULT_MAX_LINES = 500

export interface ToolContext {
  repoRoot: string
}

export async function listDirectory(
  ctx: ToolContext,
  input: { path: string }
): Promise<{ entries: string[] } | { error: string }> {
  const safePath = sandboxPath(ctx.repoRoot, input.path)
  if (!safePath) {
    return { error: 'Path escapes repo sandbox' }
  }
  try {
    const entries = await fs.readdir(safePath)
    return { entries }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function readFile(
  ctx: ToolContext,
  input: { path: string; maxLines?: number }
): Promise<{ content: string } | { error: string }> {
  const safePath = sandboxPath(ctx.repoRoot, input.path)
  if (!safePath) {
    return { error: 'Path escapes repo sandbox' }
  }
  const maxLines = Math.min(
    input.maxLines ?? DEFAULT_MAX_LINES,
    MAX_FILE_LINES
  )
  try {
    const raw = await fs.readFile(safePath, 'utf8')
    const lines = raw.split('\n')
    const truncated = lines.length > maxLines
    const content = truncated
      ? lines.slice(0, maxLines).join('\n') +
        `\n\n... (truncated, ${lines.length - maxLines} more lines)`
      : raw
    return { content }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/** Simple glob: * matches any chars in filename, ** matches path segments. */
function matchGlob(relative: string, glob: string): boolean {
  const normalized = relative.replace(/\\/g, '/')
  const regex = new RegExp(
    '^' +
      glob
        .replace(/\./g, '\\.')
        .replace(/\*\*/g, '<<<STARSTAR>>>')
        .replace(/\*/g, '[^/]*')
        .replace(/<<<STARSTAR>>>/g, '.*') +
      '$'
  )
  return regex.test(normalized)
}

export async function searchFiles(
  ctx: ToolContext,
  input: { pattern: string; glob?: string }
): Promise<{ matches: Array<{ path: string; line: number; text: string }> } | { error: string }> {
  const searchRootRaw = sandboxPath(ctx.repoRoot, '.')
  if (!searchRootRaw) return { error: 'Invalid repo root' }
  const searchRoot: string = searchRootRaw

  let regex: RegExp
  try {
    regex = new RegExp(input.pattern)
  } catch {
    return { error: 'Invalid regex pattern' }
  }

  const globPattern = input.glob ?? '**/*'
  const startDir = searchRoot
  const matches: Array<{ path: string; line: number; text: string }> = []

  async function searchDir(dir: string): Promise<void> {
    const safe = sandboxPath(ctx.repoRoot, dir)
    if (!safe) return
    try {
      const entries = await fs.readdir(safe, { withFileTypes: true })
      for (const e of entries) {
        const full = path.join(safe, e.name)
        const rel = path.relative(searchRoot, full).replace(/\\/g, '/')
        if (e.isDirectory()) {
          if (e.name !== 'node_modules' && e.name !== '.git') {
            await searchDir(full)
          }
        } else if (e.isFile() && matchGlob(rel, globPattern || '**/*')) {
          try {
            const content = await fs.readFile(full, 'utf8')
            const lines = content.split('\n')
            for (let i = 0; i < lines.length; i++) {
              if (regex.test(lines[i])) {
                matches.push({
                  path: rel,
                  line: i + 1,
                  text: lines[i].trim().slice(0, 200),
                })
              }
            }
          } catch {
            // Skip unreadable files
          }
        }
      }
    } catch {
      // Skip
    }
  }

  await searchDir(startDir)
  return { matches: matches.slice(0, 100) }
}
