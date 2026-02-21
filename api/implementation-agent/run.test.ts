import { describe, it, expect } from 'vitest'
import { parseTicketId, extractTicketSections, validateInputs } from './run.js'

/**
 * Unit tests for api/implementation-agent/run.ts
 * Tests extracted pure functions and parsing logic.
 */

describe('parseTicketId', () => {
  it('should extract ticket ID from "Implement ticket 0046"', () => {
    expect(parseTicketId('Implement ticket 0046')).toBe('0046')
  })

  it('should extract ticket ID from "implement ticket 1234" (lowercase)', () => {
    expect(parseTicketId('implement ticket 1234')).toBe('1234')
  })

  it('should extract ticket ID from "IMPLEMENT TICKET 5678" (uppercase)', () => {
    expect(parseTicketId('IMPLEMENT TICKET 5678')).toBe('5678')
  })

  it('should return null for invalid message format', () => {
    expect(parseTicketId('Fix ticket 123')).toBeNull()
    expect(parseTicketId('Implement 123')).toBeNull()
    expect(parseTicketId('')).toBeNull()
  })

  it('should extract ticket ID from message with extra text', () => {
    expect(parseTicketId('Please Implement ticket 9999 now')).toBe('9999')
  })
})

describe('extractTicketSections', () => {
  it('should extract goal, deliverable, and criteria from ticket body', () => {
    const bodyMd = `## Goal (one sentence)

Add a feature.

## Human-verifiable deliverable (UI-only)

User sees a button.

## Acceptance criteria (UI-only)

- [ ] Item 1
- [ ] Item 2

## Constraints

Some constraints.`

    const result = extractTicketSections(bodyMd)

    expect(result.goal).toBe('Add a feature.')
    expect(result.deliverable).toBe('User sees a button.')
    expect(result.criteria).toBe('- [ ] Item 1\n- [ ] Item 2')
  })

  it('should handle missing sections gracefully', () => {
    const bodyMd = `## Goal (one sentence)

Add a feature.

## Constraints

Some constraints.`

    const result = extractTicketSections(bodyMd)

    expect(result.goal).toBe('Add a feature.')
    expect(result.deliverable).toBe('')
    expect(result.criteria).toBe('')
  })

  it('should handle empty ticket body', () => {
    const result = extractTicketSections('')
    expect(result.goal).toBe('')
    expect(result.deliverable).toBe('')
    expect(result.criteria).toBe('')
  })

  it('should extract sections with varying heading formats', () => {
    const bodyMd = `## Goal (one sentence)

My goal here.

## Human-verifiable deliverable (UI-only)

My deliverable.

## Acceptance criteria (UI-only)

- [ ] Criterion 1`

    const result = extractTicketSections(bodyMd)

    expect(result.goal).toBe('My goal here.')
    expect(result.deliverable).toBe('My deliverable.')
    expect(result.criteria).toBe('- [ ] Criterion 1')
  })
})

describe('validateInputs', () => {
  it('should return valid for complete inputs', () => {
    const ticketId = parseTicketId('Implement ticket 0046')
    const result = validateInputs(
      'Implement ticket 0046',
      ticketId,
      'https://example.supabase.co',
      'anon-key',
      'owner/repo'
    )

    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('should return invalid for missing ticket ID in message', () => {
    const ticketId = parseTicketId('Fix something')
    const result = validateInputs(
      'Fix something',
      ticketId,
      'https://example.supabase.co',
      'anon-key',
      'owner/repo'
    )

    expect(result.valid).toBe(false)
    expect(result.error).toContain('Say "Implement ticket XXXX"')
    expect(result.status).toBe('invalid-input')
  })

  it('should return invalid for missing supabaseUrl', () => {
    const ticketId = parseTicketId('Implement ticket 0046')
    const result = validateInputs(
      'Implement ticket 0046',
      ticketId,
      undefined,
      'anon-key',
      'owner/repo'
    )

    expect(result.valid).toBe(false)
    expect(result.error).toContain('Supabase not configured')
    expect(result.status).toBe('ticket-not-found')
  })

  it('should return invalid for missing supabaseAnonKey', () => {
    const ticketId = parseTicketId('Implement ticket 0046')
    const result = validateInputs(
      'Implement ticket 0046',
      ticketId,
      'https://example.supabase.co',
      undefined,
      'owner/repo'
    )

    expect(result.valid).toBe(false)
    expect(result.error).toContain('Supabase not configured')
    expect(result.status).toBe('ticket-not-found')
  })

  it('should return invalid for missing repoFullName', () => {
    const ticketId = parseTicketId('Implement ticket 0046')
    const result = validateInputs(
      'Implement ticket 0046',
      ticketId,
      'https://example.supabase.co',
      'anon-key',
      undefined
    )

    expect(result.valid).toBe(false)
    expect(result.error).toContain('No GitHub repo connected')
    expect(result.status).toBe('no-repo')
  })

  it('should handle undefined inputs as missing', () => {
    const ticketId = parseTicketId('Implement ticket 0046')
    const result = validateInputs(
      'Implement ticket 0046',
      ticketId,
      undefined,
      'anon-key',
      'owner/repo'
    )

    expect(result.valid).toBe(false)
    expect(result.error).toContain('Supabase not configured')
  })
})
