import path from 'path'
import { execSync } from 'child_process'

/** Resolve GitHub repo URL from git remote */
export function resolveRepoUrl(repoRoot: string): string {
  try {
    const out = execSync('git remote get-url origin', { cwd: repoRoot, encoding: 'utf8' })
    const raw = out.trim()
    // Normalize to https://github.com/owner/repo (handle git@github.com:owner/repo.git)
    const sshMatch = raw.match(/git@github\.com:([^/]+)\/([^/]+?)(\.git)?$/i)
    if (sshMatch) {
      return `https://github.com/${sshMatch[1]}/${sshMatch[2]}`
    } else if (/^https:\/\/github\.com\//i.test(raw)) {
      return raw.replace(/\.git$/i, '')
    } else {
      throw new Error('No GitHub remote found')
    }
  } catch {
    throw new Error('Could not resolve GitHub repository')
  }
}

/** Build prompt text from ticket body markdown */
export function buildPromptFromTicket(bodyMd: string, sections: string[] = ['Goal', 'Human-verifiable deliverable', 'Acceptance criteria']): string {
  const goalMatch = bodyMd.match(/##\s*Goal[^\n]*\s*\([^)]*\)\s*\n([\s\S]*?)(?=\n##|$)/i)
  const deliverableMatch = bodyMd.match(/##\s*Human-verifiable deliverable[^\n]*\n([\s\S]*?)(?=\n##|$)/i)
  const criteriaMatch = bodyMd.match(/##\s*Acceptance criteria[^\n]*\n([\s\S]*?)(?=\n##|$)/i)
  const goal = (goalMatch?.[1] ?? '').trim()
  const deliverable = (deliverableMatch?.[1] ?? '').trim()
  const criteria = (criteriaMatch?.[1] ?? '').trim()
  
  return [
    '## Goal',
    goal || '(not specified)',
    '',
    '## Human-verifiable deliverable',
    deliverable || '(not specified)',
    '',
    '## Acceptance criteria',
    criteria || '(not specified)',
  ].join('\n')
}

/** Update ticket frontmatter with kanban column/position */
export function updateTicketFrontmatter(content: string, columnId: string, position: number, movedAt: string): string {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (fmMatch) {
    const block = fmMatch[1]
    const lines = block.split('\n')
    const out: string[] = []
    let hasCol = false
    let hasPos = false
    let hasMoved = false
    for (const line of lines) {
      if (/^kanbanColumnId\s*:/.test(line)) { out.push(`kanbanColumnId: ${columnId}`); hasCol = true; continue }
      if (/^kanbanPosition\s*:/.test(line)) { out.push(`kanbanPosition: ${position}`); hasPos = true; continue }
      if (/^kanbanMovedAt\s*:/.test(line)) { out.push(`kanbanMovedAt: ${movedAt}`); hasMoved = true; continue }
      out.push(line)
    }
    if (!hasCol) out.push(`kanbanColumnId: ${columnId}`)
    if (!hasPos) out.push(`kanbanPosition: ${position}`)
    if (!hasMoved) out.push(`kanbanMovedAt: ${movedAt}`)
    return content.replace(/^---\n[\s\S]*?\n---/, `---\n${out.join('\n')}\n---`)
  } else {
    // No frontmatter, add it
    return `---\nkanbanColumnId: ${columnId}\nkanbanPosition: ${position}\nkanbanMovedAt: ${movedAt}\n---\n${content}`
  }
}
