import { describe, it, expect } from 'vitest'
import {
  parseTicketId,
  parseTicketBodySections,
  buildFailureNotesSection,
  getHalApiUrl,
} from './_helpers.js'

describe('parseTicketId', () => {
  it('should parse ticket ID from standard format', () => {
    expect(parseTicketId('Implement ticket 0046')).toBe('0046')
    expect(parseTicketId('Implement ticket 1234')).toBe('1234')
    expect(parseTicketId('implement ticket 0717')).toBe('0717')
  })

  it('should be case-insensitive', () => {
    expect(parseTicketId('IMPLEMENT TICKET 0046')).toBe('0046')
    expect(parseTicketId('Implement Ticket 1234')).toBe('1234')
    expect(parseTicketId('iMpLeMeNt TiCkEt 0717')).toBe('0717')
  })

  it('should handle whitespace variations', () => {
    expect(parseTicketId('Implement  ticket  0046')).toBe('0046')
    expect(parseTicketId('  Implement ticket 1234  ')).toBe('1234')
    expect(parseTicketId('Implement\tticket\n0717')).toBe('0717')
  })

  it('should return null for invalid formats', () => {
    expect(parseTicketId('Implement ticket 46')).toBeNull()
    expect(parseTicketId('Implement ticket 12345')).toBeNull()
    expect(parseTicketId('Implement ticket abc')).toBeNull()
    expect(parseTicketId('Implement ticket')).toBeNull()
    expect(parseTicketId('')).toBeNull()
    expect(parseTicketId('Some other message')).toBeNull()
  })

  it('should only match 4-digit ticket IDs', () => {
    expect(parseTicketId('Implement ticket 0046')).toBe('0046')
    expect(parseTicketId('Implement ticket 46')).toBeNull()
    expect(parseTicketId('Implement ticket 123')).toBeNull()
    expect(parseTicketId('Implement ticket 12345')).toBeNull()
  })
})

describe('parseTicketBodySections', () => {
  it('should parse all three sections correctly', () => {
    const bodyMd = `## Goal (one sentence)

Add a feature.

## Human-verifiable deliverable (UI-only)

User sees a button.

## Acceptance criteria (UI-only)

- [ ] Button is visible
- [ ] Button is clickable
`
    const result = parseTicketBodySections(bodyMd)
    
    expect(result.goal).toBe('Add a feature.')
    expect(result.deliverable).toBe('User sees a button.')
    expect(result.criteria).toBe('- [ ] Button is visible\n- [ ] Button is clickable')
  })

  it('should handle missing sections with empty strings', () => {
    const bodyMd = `## Goal (one sentence)

Add a feature.
`
    const result = parseTicketBodySections(bodyMd)
    
    expect(result.goal).toBe('Add a feature.')
    expect(result.deliverable).toBe('')
    expect(result.criteria).toBe('')
  })

  it('should handle sections in different order', () => {
    const bodyMd = `## Acceptance criteria (UI-only)

- [ ] Test 1

## Goal (one sentence)

Different goal.

## Human-verifiable deliverable (UI-only)

Different deliverable.
`
    const result = parseTicketBodySections(bodyMd)
    
    expect(result.goal).toBe('Different goal.')
    expect(result.deliverable).toBe('Different deliverable.')
    expect(result.criteria).toBe('- [ ] Test 1')
  })

  it('should handle sections with parentheses variations', () => {
    const bodyMd = `## Goal (one sentence)

Goal text.

## Human-verifiable deliverable (UI only)

Deliverable text.

## Acceptance criteria (UI-only)

Criteria text.
`
    const result = parseTicketBodySections(bodyMd)
    
    expect(result.goal).toBe('Goal text.')
    expect(result.deliverable).toBe('Deliverable text.')
    expect(result.criteria).toBe('Criteria text.')
  })

  it('should return empty strings for empty body', () => {
    const result = parseTicketBodySections('')
    
    expect(result.goal).toBe('')
    expect(result.deliverable).toBe('')
    expect(result.criteria).toBe('')
  })

  it('should handle multiline section content', () => {
    const bodyMd = `## Goal (one sentence)

This is a goal
that spans multiple lines
and has details.

## Acceptance criteria (UI-only)

- [ ] Item 1
- [ ] Item 2
- [ ] Item 3
`
    const result = parseTicketBodySections(bodyMd)
    
    expect(result.goal).toBe('This is a goal\nthat spans multiple lines\nand has details.')
    expect(result.criteria).toBe('- [ ] Item 1\n- [ ] Item 2\n- [ ] Item 3')
  })
})

describe('buildFailureNotesSection', () => {
  it('should build section with implementation agent note when provided', () => {
    const note = 'This ticket failed because of X, Y, and Z.'
    const result = buildFailureNotesSection(note, false)
    const resultText = result.join('\n')
    
    expect(resultText).toContain('## IMPORTANT: Previous QA Failure — Implementation Agent Note')
    expect(resultText).toContain('**This ticket previously failed QA.')
    expect(resultText).toContain('```')
    expect(resultText).toContain(note)
    expect(resultText).toContain('**You MUST address every issue and required action above.')
  })

  it('should build generic section when no note provided', () => {
    const result = buildFailureNotesSection(null, false)
    const resultText = result.join('\n')
    
    expect(resultText).toContain('## IMPORTANT: Read Failure Notes Before Starting')
    expect(resultText).toContain('**BEFORE you start implementing, you MUST:**')
    expect(resultText).toContain('1. **Read the full ticket body above**')
    expect(resultText).toContain('2. **Check for QA artifacts**')
    expect(resultText).toContain('3. **Address any failure reasons**')
  })

  it('should include warning when ticket is back in To Do', () => {
    const result = buildFailureNotesSection(null, true)
    const resultText = result.join('\n')
    
    expect(resultText).toContain('**⚠️ This ticket is back in To Do')
  })

  it('should not include warning when ticket is not back in To Do', () => {
    const result = buildFailureNotesSection(null, false)
    const resultText = result.join('\n')
    
    expect(resultText).not.toContain('⚠️')
  })

  it('should prioritize implementation agent note over generic section', () => {
    const note = 'Fix the bug in component X'
    const result = buildFailureNotesSection(note, true)
    const resultText = result.join('\n')
    
    expect(resultText).toContain('## IMPORTANT: Previous QA Failure — Implementation Agent Note')
    expect(resultText).not.toContain('## IMPORTANT: Read Failure Notes Before Starting')
  })
})

describe('getHalApiUrl', () => {
  it('should return HAL_API_URL when set', () => {
    const original = process.env.HAL_API_URL
    process.env.HAL_API_URL = 'https://example.com'
    
    try {
      expect(getHalApiUrl()).toBe('https://example.com')
    } finally {
      if (original) {
        process.env.HAL_API_URL = original
      } else {
        delete process.env.HAL_API_URL
      }
    }
  })

  it('should return APP_ORIGIN when HAL_API_URL is not set', () => {
    const originalHal = process.env.HAL_API_URL
    const originalApp = process.env.APP_ORIGIN
    delete process.env.HAL_API_URL
    process.env.APP_ORIGIN = 'https://app.example.com'
    
    try {
      expect(getHalApiUrl()).toBe('https://app.example.com')
    } finally {
      if (originalHal) {
        process.env.HAL_API_URL = originalHal
      }
      if (originalApp) {
        process.env.APP_ORIGIN = originalApp
      } else {
        delete process.env.APP_ORIGIN
      }
    }
  })

  it('should return default localhost URL when neither env var is set', () => {
    const originalHal = process.env.HAL_API_URL
    const originalApp = process.env.APP_ORIGIN
    delete process.env.HAL_API_URL
    delete process.env.APP_ORIGIN
    
    try {
      expect(getHalApiUrl()).toBe('http://localhost:5173')
    } finally {
      if (originalHal) {
        process.env.HAL_API_URL = originalHal
      }
      if (originalApp) {
        process.env.APP_ORIGIN = originalApp
      }
    }
  })
})
