/**
 * Client-side file access utilities for PM agent repository inspection.
 * Uses File System Access API to read/search files in the connected project folder.
 */

export interface FileReadRequest {
  type: 'read_file'
  requestId: string
  path: string
  maxLines?: number
}

export interface FileSearchRequest {
  type: 'search_files'
  requestId: string
  pattern: string
  glob?: string
}

export type FileAccessRequest = FileReadRequest | FileSearchRequest

export interface FileReadResult {
  type: 'read_file'
  requestId: string
  success: true
  content?: string
  error?: string
}

export interface FileSearchResult {
  type: 'search_files'
  requestId: string
  success: true
  matches?: Array<{ path: string; line: number; text: string }>
  error?: string
}

export type FileAccessResult = FileReadResult | FileSearchResult

/** Read a file from the project folder. Path is relative to folder root. */
export async function readFileFromHandle(
  handle: FileSystemDirectoryHandle,
  filePath: string,
  maxLines = 500
): Promise<{ content: string } | { error: string }> {
  const parts = filePath.split('/').filter(Boolean)
  if (parts.length === 0) {
    return { error: 'Invalid file path' }
  }

  try {
    let dirHandle: FileSystemDirectoryHandle = handle
    for (let i = 0; i < parts.length - 1; i++) {
      dirHandle = await dirHandle.getDirectoryHandle(parts[i])
    }
    const fileHandle = await dirHandle.getFileHandle(parts[parts.length - 1])
    const file = await fileHandle.getFile()
    const text = await file.text()
    const lines = text.split('\n')
    if (lines.length > maxLines) {
      return {
        content: lines.slice(0, maxLines).join('\n') + `\n\n... (truncated, ${lines.length - maxLines} more lines)`,
      }
    }
    return { content: text }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/** List directory entries. Path is relative to folder root. */
export async function listDirectoryFromHandle(
  handle: FileSystemDirectoryHandle,
  dirPath: string
): Promise<{ entries: string[] } | { error: string }> {
  const parts = dirPath.split('/').filter(Boolean)
  try {
    let currentHandle: FileSystemDirectoryHandle = handle
    for (const part of parts) {
      currentHandle = await currentHandle.getDirectoryHandle(part)
    }
    const entries: string[] = []
    // DOM lib may not type FileSystemDirectoryHandle.values(); assert so we can call it
    const dirWithValues = currentHandle as FileSystemDirectoryHandle & {
      values(): AsyncIterableIterator<FileSystemDirectoryHandle | FileSystemFileHandle>
    }
    for await (const entry of dirWithValues.values()) {
      entries.push(entry.name)
    }
    return { entries }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/** Simple glob matching: * matches any chars in filename, ** matches path segments. */
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

/** Search files in the project folder using regex pattern. */
export async function searchFilesFromHandle(
  handle: FileSystemDirectoryHandle,
  pattern: string,
  glob = '**/*'
): Promise<{ matches: Array<{ path: string; line: number; text: string }> } | { error: string }> {
  let regex: RegExp
  try {
    regex = new RegExp(pattern)
  } catch {
    return { error: 'Invalid regex pattern' }
  }

  const matches: Array<{ path: string; line: number; text: string }> = []

  const dirWithValues = (h: FileSystemDirectoryHandle) =>
    h as FileSystemDirectoryHandle & {
      values(): AsyncIterableIterator<FileSystemDirectoryHandle | FileSystemFileHandle>
    }
  async function searchDir(dirHandle: FileSystemDirectoryHandle, relativePath: string): Promise<void> {
    try {
      for await (const entry of dirWithValues(dirHandle).values()) {
        const entryPath = relativePath ? `${relativePath}/${entry.name}` : entry.name
        if (entry.kind === 'directory') {
          // Skip node_modules and .git
          if (entry.name !== 'node_modules' && entry.name !== '.git') {
            const subDirHandle = await dirHandle.getDirectoryHandle(entry.name)
            await searchDir(subDirHandle, entryPath)
          }
        } else if (entry.kind === 'file' && matchGlob(entryPath, glob)) {
          try {
            const fileHandle = await dirHandle.getFileHandle(entry.name)
            const file = await fileHandle.getFile()
            const content = await file.text()
            const lines = content.split('\n')
            for (let i = 0; i < lines.length; i++) {
              if (regex.test(lines[i])) {
                matches.push({
                  path: entryPath,
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
      // Skip unreadable directories
    }
  }

  await searchDir(handle, '')
  return { matches: matches.slice(0, 100) }
}
