import { describe, it, expect } from 'vitest'
import {
  slugFromTitle,
  parseTicketNumber,
  normalizeBodyForReady,
  evaluateTicketReady,
} from './projectManager.js'

describe('slugFromTitle', () => {
  it('should convert title to lowercase slug with hyphens', () => {
    expect(slugFromTitle('My Awesome Ticket')).toBe('my-awesome-ticket')
  })

  it('should remove non-alphanumeric characters except hyphens', () => {
    expect(slugFromTitle('Ticket #123 - Feature!')).toBe('ticket-123-feature')
  })

  it('should collapse multiple hyphens into one', () => {
    expect(slugFromTitle('Ticket---With---Many---Hyphens')).toBe('ticket-with-many-hyphens')
  })

  it('should remove leading and trailing hyphens', () => {
    expect(slugFromTitle('-Ticket-')).toBe('ticket')
  })

  it('should handle empty or whitespace-only titles', () => {
    expect(slugFromTitle('')).toBe('ticket')
    expect(slugFromTitle('   ')).toBe('ticket')
  })

  it('should handle titles with only special characters', () => {
    expect(slugFromTitle('!!!')).toBe('ticket')
  })
})

describe('parseTicketNumber', () => {
  it('should extract ticket number from display ID format', () => {
    expect(parseTicketNumber('HAL-0048')).toBe(48)
  })

  it('should extract ticket number from numeric string', () => {
    expect(parseTicketNumber('48')).toBe(48)
  })

  it('should extract the last digit sequence when multiple exist', () => {
    expect(parseTicketNumber('HAL-0012-extra-34')).toBe(34)
  })

  it('should handle zero-padded numbers', () => {
    expect(parseTicketNumber('HAL-0001')).toBe(1)
  })

  it('should return null for strings without digits', () => {
    expect(parseTicketNumber('HAL-ABC')).toBe(null)
    expect(parseTicketNumber('no-numbers')).toBe(null)
  })

  it('should return null for empty or whitespace strings', () => {
    expect(parseTicketNumber('')).toBe(null)
    expect(parseTicketNumber('   ')).toBe(null)
  })

  it('should handle very long ticket numbers', () => {
    expect(parseTicketNumber('HAL-1234')).toBe(1234)
  })
})

describe('normalizeBodyForReady', () => {
  it('should convert H1 Goal to H2 Goal (one sentence)', () => {
    const input = '# Goal\n\nThis is a goal.'
    const output = normalizeBodyForReady(input)
    expect(output).toContain('## Goal (one sentence)')
    // The regex matches lines that are exactly "# Goal" - verify the replacement happened
    expect(output).not.toMatch(/^# Goal$/m)
  })

  it('should convert H1 Human-verifiable deliverable to H2 with (UI-only)', () => {
    const input = '# Human-verifiable deliverable\n\nUser sees a button.'
    const output = normalizeBodyForReady(input)
    expect(output).toContain('## Human-verifiable deliverable (UI-only)')
    // The regex matches lines that are exactly "# Human-verifiable deliverable" - verify replacement
    expect(output).not.toMatch(/^# Human-verifiable deliverable$/m)
  })

  it('should convert H1 Acceptance criteria to H2 with (UI-only)', () => {
    const input = '# Acceptance criteria\n\n- [ ] Item 1'
    const output = normalizeBodyForReady(input)
    expect(output).toContain('## Acceptance criteria (UI-only)')
    // The regex matches lines that are exactly "# Acceptance criteria" - verify replacement
    expect(output).not.toMatch(/^# Acceptance criteria$/m)
  })

  it('should convert H1 Constraints to H2 Constraints', () => {
    const input = '# Constraints\n\nNo external APIs.'
    const output = normalizeBodyForReady(input)
    expect(output).toContain('## Constraints')
    // The regex matches lines that are exactly "# Constraints" - verify replacement
    expect(output).not.toMatch(/^# Constraints$/m)
  })

  it('should convert H1 Non-goals to H2 Non-goals', () => {
    const input = '# Non-goals\n\nNot doing X.'
    const output = normalizeBodyForReady(input)
    expect(output).toContain('## Non-goals')
    // The regex matches lines that are exactly "# Non-goals" - verify replacement
    expect(output).not.toMatch(/^# Non-goals$/m)
  })

  it('should handle multiple section replacements', () => {
    const input = `# Goal\n\nGoal text.

# Human-verifiable deliverable\n\nDeliverable text.

# Acceptance criteria\n\n- [ ] AC 1`
    const output = normalizeBodyForReady(input)
    expect(output).toContain('## Goal (one sentence)')
    expect(output).toContain('## Human-verifiable deliverable (UI-only)')
    expect(output).toContain('## Acceptance criteria (UI-only)')
  })

  it('should preserve existing H2 sections', () => {
    const input = '## Goal (one sentence)\n\nGoal text.'
    const output = normalizeBodyForReady(input)
    expect(output).toBe(input.trim())
  })

  it('should trim whitespace', () => {
    const input = '   \n# Goal\n\nText\n   '
    const output = normalizeBodyForReady(input)
    expect(output).not.toMatch(/^\s+/)
    expect(output).not.toMatch(/\s+$/)
  })
})

describe('evaluateTicketReady', () => {
  it('should return ready: true for a complete ticket body', () => {
    const body = `## Goal (one sentence)

Add a feature.

## Human-verifiable deliverable (UI-only)

User sees a button.

## Acceptance criteria (UI-only)

- [ ] Button is visible
- [ ] Button is clickable

## Constraints

No external APIs.

## Non-goals

Not doing X.`
    const result = evaluateTicketReady(body)
    expect(result.ready).toBe(true)
    expect(result.missingItems).toHaveLength(0)
  })

  it('should detect missing Goal section', () => {
    const body = `## Human-verifiable deliverable (UI-only)

User sees a button.`
    const result = evaluateTicketReady(body)
    expect(result.ready).toBe(false)
    expect(result.missingItems).toContain('Goal (one sentence) missing or placeholder')
  })

  it('should detect placeholders in Goal section', () => {
    const body = `## Goal (one sentence)

<AC 1> feature.

## Human-verifiable deliverable (UI-only)

User sees a button.

## Acceptance criteria (UI-only)

- [ ] Item

## Constraints

None.

## Non-goals

None.`
    const result = evaluateTicketReady(body)
    expect(result.ready).toBe(false)
    expect(result.missingItems.some(item => item.includes('Goal'))).toBe(true)
  })

  it('should detect missing acceptance criteria checkboxes', () => {
    const body = `## Goal (one sentence)

Add feature.

## Human-verifiable deliverable (UI-only)

User sees button.

## Acceptance criteria (UI-only)

No checkboxes here.

## Constraints

None.

## Non-goals

None.`
    const result = evaluateTicketReady(body)
    expect(result.ready).toBe(false)
    expect(result.missingItems).toContain('Acceptance criteria checkboxes missing')
  })

  it('should detect unresolved placeholders in body', () => {
    const body = `## Goal (one sentence)

Add <task-id> feature.

## Human-verifiable deliverable (UI-only)

User sees button.

## Acceptance criteria (UI-only)

- [ ] Item

## Constraints

None.

## Non-goals

None.`
    const result = evaluateTicketReady(body)
    expect(result.ready).toBe(false)
    expect(result.missingItems.some(item => item.includes('Unresolved placeholders'))).toBe(true)
  })
})
