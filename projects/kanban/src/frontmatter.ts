/**
 * Minimal YAML frontmatter parse/merge/serialize for kanban metadata.
 * Merges kanbanColumnId, kanbanPosition, kanbanMovedAt without destroying other keys.
 */

export type KanbanFrontmatter = {
  kanbanColumnId?: string
  kanbanPosition?: number
  kanbanMovedAt?: string
}

/** Parse frontmatter block (lines of "key: value") into record. Values are trimmed strings. */
function parseFrontmatterBlock(block: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of block.split('\n')) {
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const key = line.slice(0, colon).trim()
    const value = line.slice(colon + 1).trim()
    if (key) out[key] = value
  }
  return out
}

/** Serialize record to YAML-like frontmatter block (key: value, one per line). */
function serializeFrontmatterBlock(fm: Record<string, string>): string {
  return Object.entries(fm)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join('\n')
}

export type ParsedDoc = {
  frontmatter: Record<string, string>
  body: string
}

/**
 * Split content into optional frontmatter (between first --- and second ---) and body.
 * If no closing ---, entire content is body and frontmatter is {}.
 */
export function parseFrontmatter(content: string): ParsedDoc {
  const open = content.startsWith('---')
  if (!open) return { frontmatter: {}, body: content }
  const afterFirst = content.slice(3)
  const closeIdx = afterFirst.indexOf('\n---')
  if (closeIdx === -1) return { frontmatter: {}, body: content }
  const block = afterFirst.slice(0, closeIdx).trim()
  const body = afterFirst.slice(closeIdx + 4).trimStart()
  const frontmatter = parseFrontmatterBlock(block)
  return { frontmatter, body }
}

/**
 * Extract kanban fields from parsed frontmatter.
 * kanbanPosition is parsed as integer; invalid values are ignored.
 */
export function getKanbanFromFrontmatter(fm: Record<string, string>): KanbanFrontmatter {
  const out: KanbanFrontmatter = {}
  if (fm.kanbanColumnId != null && fm.kanbanColumnId !== '') out.kanbanColumnId = fm.kanbanColumnId
  if (fm.kanbanPosition != null && fm.kanbanPosition !== '') {
    const n = parseInt(fm.kanbanPosition, 10)
    if (!Number.isNaN(n)) out.kanbanPosition = n
  }
  if (fm.kanbanMovedAt != null && fm.kanbanMovedAt !== '') out.kanbanMovedAt = fm.kanbanMovedAt
  return out
}

/**
 * Merge kanban updates into existing frontmatter. Other keys are preserved.
 * Updates only the three kanban keys that are provided (non-undefined).
 */
export function mergeKanbanFrontmatter(
  existing: Record<string, string>,
  updates: KanbanFrontmatter
): Record<string, string> {
  const merged = { ...existing }
  if (updates.kanbanColumnId !== undefined) merged.kanbanColumnId = updates.kanbanColumnId
  if (updates.kanbanPosition !== undefined) merged.kanbanPosition = String(updates.kanbanPosition)
  if (updates.kanbanMovedAt !== undefined) merged.kanbanMovedAt = updates.kanbanMovedAt
  return merged
}

/**
 * Build full document content: ---\nfrontmatter\n---\nbody
 */
export function serializeDoc(parsed: ParsedDoc): string {
  const { frontmatter, body } = parsed
  if (Object.keys(frontmatter).length === 0) return body
  return `---\n${serializeFrontmatterBlock(frontmatter)}\n---\n${body}`
}

/**
 * Update a document's kanban frontmatter and return new content.
 */
export function updateKanbanInContent(
  content: string,
  updates: KanbanFrontmatter
): string {
  const parsed = parseFrontmatter(content)
  const merged = mergeKanbanFrontmatter(parsed.frontmatter, updates)
  return serializeDoc({ ...parsed, frontmatter: merged })
}
