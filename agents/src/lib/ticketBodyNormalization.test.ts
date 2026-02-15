import { describe, it, expect } from 'vitest'
import {
  normalizeBodyForReady,
  sectionContent,
  normalizeTitleLineInBody,
} from './ticketBodyNormalization'

describe('normalizeBodyForReady', () => {
  it('normalizes # Goal to ## Goal (one sentence)', () => {
    const input = '# Goal\n\nSome content'
    const result = normalizeBodyForReady(input)
    expect(result).toBe('## Goal (one sentence)\nSome content')
  })

  it('normalizes # Human-verifiable deliverable to ## Human-verifiable deliverable (UI-only)', () => {
    const input = '# Human-verifiable deliverable\n\nSome content'
    const result = normalizeBodyForReady(input)
    expect(result).toBe('## Human-verifiable deliverable (UI-only)\nSome content')
  })

  it('normalizes # Acceptance criteria to ## Acceptance criteria (UI-only)', () => {
    const input = '# Acceptance criteria\n\nSome content'
    const result = normalizeBodyForReady(input)
    expect(result).toBe('## Acceptance criteria (UI-only)\nSome content')
  })

  it('normalizes # Constraints to ## Constraints', () => {
    const input = '# Constraints\n\nSome content'
    const result = normalizeBodyForReady(input)
    expect(result).toBe('## Constraints\nSome content')
  })

  it('normalizes # Non-goals to ## Non-goals', () => {
    const input = '# Non-goals\n\nSome content'
    const result = normalizeBodyForReady(input)
    expect(result).toBe('## Non-goals\nSome content')
  })

  it('normalizes multiple headings in the same body', () => {
    const input = `# Goal\n\nGoal content\n\n# Acceptance criteria\n\nAC content`
    const result = normalizeBodyForReady(input)
    expect(result).toBe(`## Goal (one sentence)\nGoal content\n\n## Acceptance criteria (UI-only)\nAC content`)
  })

  it('handles headings with trailing whitespace', () => {
    const input = '# Goal   \n\nSome content'
    const result = normalizeBodyForReady(input)
    expect(result).toBe('## Goal (one sentence)\nSome content')
  })

  it('preserves already normalized headings', () => {
    const input = '## Goal (one sentence)\n\nSome content'
    const result = normalizeBodyForReady(input)
    // Function trims only leading/trailing whitespace, so structure is preserved
    expect(result).toBe('## Goal (one sentence)\n\nSome content')
  })

  it('trims leading and trailing whitespace', () => {
    const input = '   \n# Goal\n\nSome content\n   '
    const result = normalizeBodyForReady(input)
    expect(result).toBe('## Goal (one sentence)\nSome content')
  })
})

describe('sectionContent', () => {
  it('extracts content for a section with next heading', () => {
    const body = `## Goal (one sentence)\n\nThis is the goal content.\n\n## Acceptance criteria (UI-only)\n\n- [ ] Item 1`
    const result = sectionContent(body, 'Goal (one sentence)')
    expect(result).toBe('This is the goal content.')
  })

  it('extracts content until next ## heading', () => {
    const body = `## Goal (one sentence)\n\nGoal line 1\nGoal line 2\n\n## Acceptance criteria (UI-only)\n\n- [ ] Item 1`
    const result = sectionContent(body, 'Goal (one sentence)')
    expect(result).toBe('Goal line 1\nGoal line 2')
  })

  it('extracts content when section is last (no next heading)', () => {
    const body = `## Goal (one sentence)\n\nGoal content\n\n## Acceptance criteria (UI-only)\n\n- [ ] Item 1\n- [ ] Item 2`
    const result = sectionContent(body, 'Acceptance criteria (UI-only)')
    expect(result).toBe('- [ ] Item 1\n- [ ] Item 2')
  })

  it('returns empty string when section not found', () => {
    const body = `## Goal (one sentence)\n\nGoal content`
    const result = sectionContent(body, 'Non-existent section')
    expect(result).toBe('')
  })

  it('handles sections with special regex characters in title', () => {
    const body = `## Section (with parentheses)\n\nContent here\n\n## Next section\n\nMore content`
    const result = sectionContent(body, 'Section (with parentheses)')
    expect(result).toBe('Content here')
  })

  it('stops at next heading even with flexible spacing', () => {
    const body = `## Goal (one sentence)\n\nGoal content\n\n##  Acceptance criteria (UI-only)\n\nAC content`
    const result = sectionContent(body, 'Goal (one sentence)')
    expect(result).toBe('Goal content')
  })

  it('trims extracted content', () => {
    const body = `## Goal (one sentence)\n\n   \nGoal content\n   \n\n## Next`
    const result = sectionContent(body, 'Goal (one sentence)')
    expect(result).toBe('Goal content')
  })

  it('is case-sensitive for section title matching', () => {
    const body = `## Goal (one sentence)\n\nGoal content\n\n## Acceptance criteria (UI-only)\n\nAC content`
    const result = sectionContent(body, 'goal (one sentence)')
    expect(result).toBe('')
  })
})

describe('normalizeTitleLineInBody', () => {
  it('adds ID prefix when Title line exists without prefix', () => {
    const body = '- **Title**: My Ticket Title\n\nSome content'
    const result = normalizeTitleLineInBody(body, '0048')
    expect(result).toBe('- **Title**: 0048 — My Ticket Title\n\nSome content')
  })

  it('removes existing ID prefix and replaces with correct one', () => {
    const body = '- **Title**: 0037 — Old Title\n\nSome content'
    const result = normalizeTitleLineInBody(body, '0048')
    expect(result).toBe('- **Title**: 0048 — Old Title\n\nSome content')
  })

  it('removes HAL- prefixed ID and replaces with correct one', () => {
    const body = '- **Title**: HAL-0037 — Old Title\n\nSome content'
    const result = normalizeTitleLineInBody(body, '0048')
    expect(result).toBe('- **Title**: 0048 — Old Title\n\nSome content')
  })

  it('handles different dash characters (—, –, -)', () => {
    const body = '- **Title**: 0037 - Old Title\n\nSome content'
    const result = normalizeTitleLineInBody(body, '0048')
    expect(result).toBe('- **Title**: 0048 — Old Title\n\nSome content')
  })

  it('preserves newline after Title line', () => {
    const body = '- **Title**: My Title\n\nContent'
    const result = normalizeTitleLineInBody(body, '0048')
    expect(result).toBe('- **Title**: 0048 — My Title\n\nContent')
  })

  it('handles Title line without trailing newline', () => {
    const body = '- **Title**: My Title'
    const result = normalizeTitleLineInBody(body, '0048')
    expect(result).toBe('- **Title**: 0048 — My Title')
  })

  it('returns body unchanged when Title line not found', () => {
    const body = '## Goal\n\nSome content without Title line'
    const result = normalizeTitleLineInBody(body, '0048')
    expect(result).toBe(body)
  })

  it('returns body unchanged when ticketId is empty', () => {
    const body = '- **Title**: My Title\n\nContent'
    const result = normalizeTitleLineInBody(body, '')
    expect(result).toBe(body)
  })

  it('returns body unchanged when bodyMd is empty', () => {
    const result = normalizeTitleLineInBody('', '0048')
    expect(result).toBe('')
  })

  it('handles title with existing prefix that has different format', () => {
    const body = '- **Title**: 0037–Old Title\n\nSome content'
    const result = normalizeTitleLineInBody(body, '0048')
    expect(result).toBe('- **Title**: 0048 — Old Title\n\nSome content')
  })

  it('trims title value before adding prefix', () => {
    const body = '- **Title**:   My Title  \n\nContent'
    const result = normalizeTitleLineInBody(body, '0048')
    // Note: The function trims the title value but preserves the original spacing in the prefix part
    expect(result).toContain('0048 — My Title')
    expect(result).toContain('**Title**:')
  })
})
