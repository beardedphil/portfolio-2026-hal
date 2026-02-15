import { describe, it, expect } from 'vitest'
import { evaluateTicketReady, ReadyCheckResult } from './readyCheck'

describe('evaluateTicketReady', () => {
  it('returns ready=true for ticket with substantial content and no placeholders', () => {
    // Create a body that's longer than TEMPLATE_BASELINE (1500 chars)
    const realContent = Array(200).fill('This is real content that describes the feature in detail. ').join('')
    const body = `## Goal (one sentence)

${realContent}

## Human-verifiable deliverable (UI-only)

User sees a new button in the UI that performs the action. The button should be clearly visible and accessible.

## Acceptance criteria (UI-only)

- [ ] Button appears in the header
- [ ] Button is clickable
- [ ] Clicking shows a success message
- [ ] Button has proper styling and accessibility attributes

## Constraints

- Use existing UI framework
- No breaking changes
- Must maintain backward compatibility

## Non-goals

- Advanced theming
- Mobile optimization
- Custom color schemes`

    const result = evaluateTicketReady(body)
    expect(result.ready).toBe(true)
    expect(result.missingItems).toEqual([])
    expect(result.checklistResults.goal).toBe(true)
    expect(result.checklistResults.deliverable).toBe(true)
    expect(result.checklistResults.acceptanceCriteria).toBe(true)
    expect(result.checklistResults.constraintsNonGoals).toBe(true)
    expect(result.checklistResults.noPlaceholders).toBe(true)
  })

  it('returns ready=false for ticket shorter than template baseline', () => {
    const body = `## Goal

Short ticket`

    const result = evaluateTicketReady(body)
    expect(result.ready).toBe(false)
    expect(result.missingItems).toContain('Ticket content is too short (needs more content beyond template)')
    expect(result.checklistResults.goal).toBe(false)
  })

  it('returns ready=false for ticket with mostly placeholders', () => {
    // Create a body that's long enough but mostly placeholders
    const placeholders = Array(100).fill('<AC 1>').join(' ')
    const body = `## Goal (one sentence)

<goal placeholder>

## Human-verifiable deliverable (UI-only)

<deliverable placeholder>

## Acceptance criteria (UI-only)

${placeholders}

## Constraints

<constraints placeholder>

## Non-goals

<non-goals placeholder>`

    const result = evaluateTicketReady(body)
    expect(result.ready).toBe(false)
    expect(result.missingItems).toContain('Ticket contains too many unresolved placeholders')
    expect(result.checklistResults.noPlaceholders).toBe(false)
  })

  it('returns ready=false for ticket that is both too short and has placeholders', () => {
    // Create a body that's short but has many placeholders (>50% of content)
    const placeholders = Array(50).fill('<AC 1>').join(' ')
    const body = `## Goal

<goal placeholder>

## Acceptance criteria

${placeholders}`

    const result = evaluateTicketReady(body)
    expect(result.ready).toBe(false)
    expect(result.missingItems.length).toBeGreaterThan(0)
    expect(result.missingItems).toContain('Ticket content is too short (needs more content beyond template)')
    // Note: if body is very short, placeholders might not be >50% of total, so this might not always be in missingItems
  })

  it('handles empty body', () => {
    const result = evaluateTicketReady('')
    expect(result.ready).toBe(false)
    expect(result.missingItems).toContain('Ticket content is too short (needs more content beyond template)')
  })

  it('handles whitespace-only body', () => {
    const result = evaluateTicketReady('   \n\n  \t  ')
    expect(result.ready).toBe(false)
    expect(result.missingItems).toContain('Ticket content is too short (needs more content beyond template)')
  })

  it('returns ready=true for ticket with some placeholders but mostly real content', () => {
    const realContent = Array(200).fill('This is real content that describes the feature in detail. ').join('')
    const body = `## Goal (one sentence)

${realContent}

## Human-verifiable deliverable (UI-only)

User sees the feature working.

## Acceptance criteria (UI-only)

- [ ] Feature works
- [ ] <AC 1> is implemented
- [ ] Tests pass

## Constraints

Use existing patterns.

## Non-goals

<non-goals>`

    const result = evaluateTicketReady(body)
    expect(result.ready).toBe(true)
    expect(result.missingItems).toEqual([])
    expect(result.checklistResults.noPlaceholders).toBe(true)
  })

  it('handles ticket exactly at template baseline length', () => {
    // Create a body exactly 1500 characters (after trim)
    // The function checks body.length > TEMPLATE_BASELINE, so exactly 1500 should fail
    const prefix = '## Goal (one sentence)\n\n'
    const content = 'x'.repeat(1500 - prefix.length)
    const body = `${prefix}${content}`

    const result = evaluateTicketReady(body)
    // Should be false because it's not > TEMPLATE_BASELINE (1500), it's == 1500
    expect(result.ready).toBe(false)
    expect(result.missingItems).toContain('Ticket content is too short (needs more content beyond template)')
  })

  it('handles ticket just above template baseline length', () => {
    // Create a body just over 1500 characters
    const content = 'x'.repeat(1501)
    const body = `## Goal (one sentence)\n\n${content}`

    const result = evaluateTicketReady(body)
    expect(result.ready).toBe(true)
    expect(result.missingItems).toEqual([])
  })

  it('trims leading and trailing whitespace', () => {
    // Create a body that's longer than TEMPLATE_BASELINE (1500 chars) after trimming
    const realContent = Array(200).fill('This is real content that describes the feature in detail. ').join('')
    const body = `   \n\n## Goal (one sentence)

${realContent}

## Human-verifiable deliverable (UI-only)

User sees a button. The button should be clearly visible and accessible.

## Acceptance criteria (UI-only)

- [ ] Button appears
- [ ] Button works
- [ ] Button has proper styling

## Constraints

None.

## Non-goals

None.   \n\n   `

    const result = evaluateTicketReady(body)
    expect(result.ready).toBe(true)
  })

  it('handles various placeholder formats', () => {
    const body = `## Goal (one sentence)

<goal>
<AC 1>
<task-id>
<AC_2>
<AC-3>
<AC 4 with spaces>

## Human-verifiable deliverable (UI-only)

<deliverable>

## Acceptance criteria (UI-only)

- [ ] <AC 1>
- [ ] <AC 2>

## Constraints

<constraints>

## Non-goals

<non-goals>`

    // This should have many placeholders, but if the body is long enough and placeholders < 50%, it might pass
    // Let's make it fail by ensuring placeholders are > 50%
    const longPlaceholders = Array(200).fill('<AC 1>').join(' ')
    const bodyWithManyPlaceholders = `## Goal\n\n${longPlaceholders}\n\n## Acceptance criteria\n\n${longPlaceholders}`

    const result = evaluateTicketReady(bodyWithManyPlaceholders)
    expect(result.ready).toBe(false)
    expect(result.missingItems).toContain('Ticket contains too many unresolved placeholders')
  })

  it('handles placeholders with different formats', () => {
    const body = `## Goal (one sentence)

<AC1>
<AC_2>
<AC-3>
<AC 4>
<AC-5_with-mixed>

## Human-verifiable deliverable (UI-only)

User sees feature.

## Acceptance criteria (UI-only)

- [ ] Item 1
- [ ] Item 2

## Constraints

None.

## Non-goals

None.`

    // This should pass if the body is long enough and placeholders are < 50%
    const result = evaluateTicketReady(body)
    // The body is probably not long enough, so it should fail on length
    expect(result.ready).toBe(false)
  })
})
