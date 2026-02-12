/**
 * Strip embedded "QA Information" / "## QA" / "## Implementation artifacts" blocks from
 * ticket body_md so we never persist them. QA is represented by artifacts only.
 * Use this whenever we write body_md to the tickets table (update_ticket_body, API update).
 */

const qaDivOpen = /<div[^>]*class=["'][^"']*qa-(info-section|section|workflow-section)(?:\s[^"']*)?["'][^>]*>/i

export function stripQABlocksFromTicketBody(bodyMd: string): string {
  if (!bodyMd || !bodyMd.trim()) return bodyMd
  const lines = bodyMd.split('\n')
  const out: string[] = []
  let inQABlock = false
  let inQAHtmlBlock = false
  let htmlDepth = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (inQAHtmlBlock) {
      const opens = (line.match(/<div[^>]*>/gi) || []).length
      const closes = (line.match(/<\/div\s*>/gi) || []).length
      htmlDepth += opens - closes
      if (htmlDepth <= 0) inQAHtmlBlock = false
      continue
    }
    if (qaDivOpen.test(line)) {
      inQAHtmlBlock = true
      htmlDepth = 1
      const closes = (line.match(/<\/div\s*>/gi) || []).length
      htmlDepth -= closes
      if (htmlDepth <= 0) inQAHtmlBlock = false
      continue
    }
    const looksLikeQAHeading =
      /^#{1,6}\s*QA\b/i.test(trimmed) ||
      /\*\*QA\s+Information\*\*/i.test(trimmed) ||
      /^<h[1-6][^>]*>[\s\S]*QA\s+Information[\s\S]*<\/h[1-6]>/i.test(trimmed) ||
      (/QA\s+Information/i.test(trimmed) && (trimmed.length < 50 || /^#?\s*\*?\*?/.test(trimmed)))
    const isOtherSectionHeading =
      /^#{1,6}\s/.test(trimmed) &&
      !/^#{1,6}\s*QA\b/i.test(trimmed) &&
      !/^#{1,6}\s*Implementation\s+artifacts\s*:?\s*$/i.test(trimmed)
    if (looksLikeQAHeading) {
      inQABlock = true
      continue
    }
    if (inQABlock) {
      if (isOtherSectionHeading) {
        inQABlock = false
        out.push(line)
      }
      continue
    }
    out.push(line)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
