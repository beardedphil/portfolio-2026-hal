import { useMemo } from 'react'

interface GitDiffViewerProps {
  diff: string
  className?: string
}

/**
 * Renders a unified git diff with syntax highlighting.
 * Supports light/dark mode via CSS variables.
 */
export function GitDiffViewer({ diff, className = '' }: GitDiffViewerProps) {
  const parsedDiff = useMemo(() => {
    if (!diff || !diff.trim()) {
      return { files: [], isEmpty: true }
    }

    const lines = diff.split('\n')
    const files: Array<{
      header: string
      hunks: Array<{
        hunkHeader: string
        lines: Array<{
          type: 'context' | 'addition' | 'deletion' | 'header'
          content: string
          lineNumber?: number
        }>
      }>
    }> = []

    let currentFile: typeof files[0] | null = null
    let currentHunk: typeof files[0]['hunks'][0] | null = null

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // File header: starts with "diff --git" or "--- a/" or "+++ b/"
      if (line.startsWith('diff --git') || line.startsWith('--- a/') || line.startsWith('+++ b/')) {
        // If we have a previous file, save it
        if (currentFile && currentHunk) {
          currentFile.hunks.push(currentHunk)
          files.push(currentFile)
        } else if (currentFile) {
          files.push(currentFile)
        }

        // Start new file
        if (line.startsWith('diff --git')) {
          currentFile = {
            header: line,
            hunks: [],
          }
          currentHunk = null
        } else if (currentFile) {
          // Append to file header
          currentFile.header += '\n' + line
        }
        continue
      }

      // Hunk header: starts with "@@"
      if (line.startsWith('@@')) {
        // Save previous hunk if exists
        if (currentHunk && currentFile) {
          currentFile.hunks.push(currentHunk)
        }

        // Start new hunk
        currentHunk = {
          hunkHeader: line,
          lines: [],
        }
        continue
      }

      // If we don't have a file yet, create one
      if (!currentFile) {
        currentFile = {
          header: '',
          hunks: [],
        }
      }

      // If we don't have a hunk yet, create one
      if (!currentHunk) {
        currentHunk = {
          hunkHeader: '',
          lines: [],
        }
      }

      // Parse line type
      let type: 'context' | 'addition' | 'deletion' | 'header' = 'context'
      let content = line

      if (line.startsWith('+') && !line.startsWith('+++')) {
        type = 'addition'
        content = line.substring(1)
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        type = 'deletion'
        content = line.substring(1)
      } else if (line.startsWith(' ')) {
        type = 'context'
        content = line.substring(1)
      } else if (line.startsWith('\\')) {
        type = 'header'
      }

      currentHunk.lines.push({
        type,
        content,
      })
    }

    // Save last file and hunk
    if (currentHunk && currentFile) {
      currentFile.hunks.push(currentHunk)
    }
    if (currentFile) {
      files.push(currentFile)
    }

    return { files, isEmpty: files.length === 0 }
  }, [diff])

  if (parsedDiff.isEmpty) {
    return (
      <div className={`git-diff-empty ${className}`}>
        <p>No diff available. This artifact was created but contains no diff content.</p>
      </div>
    )
  }

  return (
    <div className={`git-diff-viewer ${className}`}>
      {parsedDiff.files.map((file, fileIndex) => (
        <div key={fileIndex} className="git-diff-file">
          {file.header && (
            <div className="git-diff-file-header">
              <pre>{file.header}</pre>
            </div>
          )}
          {file.hunks.map((hunk, hunkIndex) => (
            <div key={hunkIndex} className="git-diff-hunk">
              {hunk.hunkHeader && (
                <div className="git-diff-hunk-header">
                  <pre>{hunk.hunkHeader}</pre>
                </div>
              )}
              <div className="git-diff-lines">
                {hunk.lines.map((line, lineIndex) => (
                  <div
                    key={lineIndex}
                    className={`git-diff-line git-diff-line-${line.type}`}
                  >
                    <span className="git-diff-line-prefix">
                      {line.type === 'addition' ? '+' : line.type === 'deletion' ? '-' : ' '}
                    </span>
                    <span className="git-diff-line-content">{line.content}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
