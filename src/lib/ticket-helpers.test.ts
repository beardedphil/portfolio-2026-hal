import { describe, it, expect } from 'vitest'
import { formatTicketId, extractTicketId } from './ticket-helpers'

describe('formatTicketId', () => {
  it('formats ticket ID with padding', () => {
    expect(formatTicketId('711')).toBe('HAL-0711')
    expect(formatTicketId('123')).toBe('HAL-0123')
    expect(formatTicketId('1')).toBe('HAL-0001')
  })

  it('handles already padded ticket IDs', () => {
    expect(formatTicketId('0711')).toBe('HAL-0711')
    expect(formatTicketId('1234')).toBe('HAL-1234')
  })

  it('returns "No ticket" for null input', () => {
    expect(formatTicketId(null)).toBe('No ticket')
  })

  it('handles empty string', () => {
    expect(formatTicketId('')).toBe('No ticket')
  })
})

describe('extractTicketId', () => {
  it('extracts ticket ID from "Implement ticket XXXX" pattern', () => {
    expect(extractTicketId('Implement ticket 0711')).toBe('0711')
    expect(extractTicketId('implement ticket 1234')).toBe('1234')
    expect(extractTicketId('IMPLEMENT TICKET 5678')).toBe('5678')
  })

  it('extracts ticket ID from "QA ticket XXXX" pattern', () => {
    expect(extractTicketId('QA ticket 0711')).toBe('0711')
    expect(extractTicketId('qa ticket 1234')).toBe('1234')
    expect(extractTicketId('Qa Ticket 5678')).toBe('5678')
  })

  it('extracts any 4-digit ticket ID from message', () => {
    expect(extractTicketId('Please work on ticket 0711')).toBe('0711')
    expect(extractTicketId('The ticket 1234 needs attention')).toBe('1234')
    expect(extractTicketId('Ticket number 5678 is ready')).toBe('5678')
  })

  it('returns null when no ticket ID is found', () => {
    expect(extractTicketId('No ticket mentioned here')).toBeNull()
    expect(extractTicketId('Ticket 123')).toBeNull() // 3 digits, not 4
    expect(extractTicketId('Ticket 12345')).toBeNull() // 5 digits, not 4
    expect(extractTicketId('')).toBeNull()
  })

  it('prefers explicit patterns over generic 4-digit match', () => {
    // If both patterns exist, "Implement ticket" should win
    expect(extractTicketId('Implement ticket 0711 and also see 1234')).toBe('0711')
  })
})
