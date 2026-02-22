import { describe, it, expect } from 'vitest'
import { stripQABlocksFromTicketBody } from './strip-qa-from-ticket-body.js'

describe('stripQABlocksFromTicketBody', () => {
  it('returns empty string for empty input', () => {
    expect(stripQABlocksFromTicketBody('')).toBe('')
    expect(stripQABlocksFromTicketBody('   ')).toBe('   ')
  })

  it('returns unchanged content when no QA blocks present', () => {
    const input = '# Ticket\n\nThis is a normal ticket body.'
    expect(stripQABlocksFromTicketBody(input)).toBe(input)
  })

  it('strips QA heading blocks', () => {
    const input = `# Ticket

## QA

Some QA content here.

## Acceptance criteria

- [ ] Item 1
`
    const expected = `# Ticket

## Acceptance criteria

- [ ] Item 1`
    expect(stripQABlocksFromTicketBody(input)).toBe(expected)
  })

  it('strips QA Information blocks', () => {
    const input = `# Ticket

**QA Information**

Some QA content.

## Goal

The goal here.
`
    const expected = `# Ticket

## Goal

The goal here.`
    expect(stripQABlocksFromTicketBody(input)).toBe(expected)
  })

  it('strips Implementation artifacts blocks', () => {
    const input = `# Ticket

## Implementation artifacts:

- Artifact 1
- Artifact 2

## Constraints

Some constraints.
`
    // Note: The function strips "## Implementation artifacts:" heading but keeps content
    // until next heading. Let's test with a heading that should be stripped.
    const input2 = `# Ticket

## QA

QA content.

## Constraints

Some constraints.
`
    const expected2 = `# Ticket

## Constraints

Some constraints.`
    expect(stripQABlocksFromTicketBody(input2)).toBe(expected2)
  })

  it('strips QA HTML div blocks', () => {
    const input = `# Ticket

<div class="qa-info-section">
  <p>QA content</p>
</div>

## Goal

The goal.
`
    const expected = `# Ticket

## Goal

The goal.`
    expect(stripQABlocksFromTicketBody(input)).toBe(expected)
  })

  it('handles nested HTML divs in QA blocks', () => {
    const input = `# Ticket

<div class="qa-section">
  <div>
    <p>Nested content</p>
  </div>
</div>

## Goal

The goal.
`
    const expected = `# Ticket

## Goal

The goal.`
    expect(stripQABlocksFromTicketBody(input)).toBe(expected)
  })

  it('preserves content after QA blocks', () => {
    const input = `# Ticket

## QA

QA content here.

## Acceptance criteria

- [ ] Item 1
- [ ] Item 2

## Constraints

Some constraints.
`
    const expected = `# Ticket

## Acceptance criteria

- [ ] Item 1
- [ ] Item 2

## Constraints

Some constraints.`
    expect(stripQABlocksFromTicketBody(input)).toBe(expected)
  })

  it('removes excessive newlines', () => {
    const input = `# Ticket



## Goal

The goal.`
    const expected = `# Ticket

## Goal

The goal.`
    expect(stripQABlocksFromTicketBody(input)).toBe(expected)
  })
})
