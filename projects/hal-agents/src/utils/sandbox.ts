import path from 'path'

/**
 * Resolves a path relative to repoRoot and ensures it stays within repoRoot.
 * Prevents path traversal (e.g. ../../../etc/passwd).
 * @returns Absolute path if safe, or null if path escapes sandbox.
 */
export function sandboxPath(repoRoot: string, relativeOrAbsolute: string): string | null {
  const absolute = path.resolve(repoRoot, relativeOrAbsolute || '.')
  const repoResolved = path.resolve(repoRoot)
  const relative = path.relative(repoResolved, absolute)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null
  }
  return absolute
}
