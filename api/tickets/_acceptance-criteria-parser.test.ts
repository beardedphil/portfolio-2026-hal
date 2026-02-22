import { describe, it, expect } from 'vitest'
import {
  parseAcceptanceCriteria,
  getAcceptanceCriteriaCount,
  hasAcceptanceCriteria,
} from './_acceptance-criteria-parser.js'

describe('parseAcceptanceCriteria', () => {
  it('returns empty array for null input', () => {
    expect(parseAcceptanceCriteria(null)).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(parseAcceptanceCriteria('')).toEqual([])
  })

  it('returns empty array when no acceptance criteria section exists', () => {
    const bodyMd = '# Ticket\n\n## Goal\n\nSome goal.'
    expect(parseAcceptanceCriteria(bodyMd)).toEqual([])
  })

  it('parses acceptance criteria with unchecked items', () => {
    const bodyMd = `# Ticket

## Acceptance criteria

- [ ] Item 1
- [ ] Item 2
- [ ] Item 3
`
    const result = parseAcceptanceCriteria(bodyMd)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ index: 0, text: 'Item 1', checked: false })
    expect(result[1]).toEqual({ index: 1, text: 'Item 2', checked: false })
    expect(result[2]).toEqual({ index: 2, text: 'Item 3', checked: false })
  })

  it('parses acceptance criteria with checked items', () => {
    const bodyMd = `# Ticket

## Acceptance criteria

- [x] Item 1
- [X] Item 2
- [ ] Item 3
`
    const result = parseAcceptanceCriteria(bodyMd)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ index: 0, text: 'Item 1', checked: true })
    expect(result[1]).toEqual({ index: 1, text: 'Item 2', checked: true })
    expect(result[2]).toEqual({ index: 2, text: 'Item 3', checked: false })
  })

  it('handles asterisk bullets', () => {
    const bodyMd = `# Ticket

## Acceptance criteria

* [ ] Item 1
* [x] Item 2
`
    const result = parseAcceptanceCriteria(bodyMd)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ index: 0, text: 'Item 1', checked: false })
    expect(result[1]).toEqual({ index: 1, text: 'Item 2', checked: true })
  })

  it('ignores non-checkbox lines', () => {
    const bodyMd = `# Ticket

## Acceptance criteria

- [ ] Item 1
Some regular text
- [ ] Item 2
`
    const result = parseAcceptanceCriteria(bodyMd)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ index: 0, text: 'Item 1', checked: false })
    expect(result[1]).toEqual({ index: 1, text: 'Item 2', checked: false })
  })

  it('stops at next section heading', () => {
    const bodyMd = `# Ticket

## Acceptance criteria

- [ ] Item 1
- [ ] Item 2

## Constraints

Some constraints.
`
    const result = parseAcceptanceCriteria(bodyMd)
    expect(result).toHaveLength(2)
  })

  it('handles case-insensitive section heading', () => {
    const bodyMd = `# Ticket

## acceptance criteria

- [ ] Item 1
`
    const result = parseAcceptanceCriteria(bodyMd)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ index: 0, text: 'Item 1', checked: false })
  })

  it('handles whitespace in section heading', () => {
    const bodyMd = `# Ticket

## Acceptance criteria (UI-only)

- [ ] Item 1
`
    const result = parseAcceptanceCriteria(bodyMd)
    expect(result).toHaveLength(1)
  })
})

describe('getAcceptanceCriteriaCount', () => {
  it('returns 0 for null input', () => {
    expect(getAcceptanceCriteriaCount(null)).toBe(0)
  })

  it('returns correct count', () => {
    const bodyMd = `# Ticket

## Acceptance criteria

- [ ] Item 1
- [ ] Item 2
- [ ] Item 3
`
    expect(getAcceptanceCriteriaCount(bodyMd)).toBe(3)
  })
})

describe('hasAcceptanceCriteria', () => {
  it('returns false for null input', () => {
    expect(hasAcceptanceCriteria(null)).toBe(false)
  })

  it('returns false when no AC section exists', () => {
    const bodyMd = '# Ticket\n\n## Goal\n\nSome goal.'
    expect(hasAcceptanceCriteria(bodyMd)).toBe(false)
  })

  it('returns true when AC section exists', () => {
    const bodyMd = `# Ticket

## Acceptance criteria

- [ ] Item 1
`
    expect(hasAcceptanceCriteria(bodyMd)).toBe(true)
  })
})
