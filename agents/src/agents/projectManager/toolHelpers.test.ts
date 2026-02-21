import { describe, it, expect } from 'vitest'
import {
  validateNoPlaceholders,
  createPlaceholderError,
  processTicketBody,
  formatTicketCreationResult,
  getRepoFullName,
} from './toolHelpers'

describe('validateNoPlaceholders', () => {
  it('returns empty array when no placeholders found', () => {
    const body = 'This is a normal ticket body without placeholders.'
    expect(validateNoPlaceholders(body)).toEqual([])
  })

  it('detects single placeholder', () => {
    const body = 'This ticket has <AC 1> placeholder.'
    expect(validateNoPlaceholders(body)).toEqual(['<AC 1>'])
  })

  it('detects multiple unique placeholders', () => {
    const body = 'Ticket with <AC 1> and <task-id> placeholders.'
    const result = validateNoPlaceholders(body)
    expect(result).toHaveLength(2)
    expect(result).toContain('<AC 1>')
    expect(result).toContain('<task-id>')
  })

  it('deduplicates repeated placeholders', () => {
    const body = 'Ticket with <AC 1> and <AC 1> repeated.'
    expect(validateNoPlaceholders(body)).toEqual(['<AC 1>'])
  })

  it('handles empty string', () => {
    expect(validateNoPlaceholders('')).toEqual([])
  })

  it('handles whitespace-only string', () => {
    expect(validateNoPlaceholders('   ')).toEqual([])
  })
})

describe('createPlaceholderError', () => {
  it('creates error with single placeholder', () => {
    const placeholders = ['<AC 1>']
    const error = createPlaceholderError(placeholders)
    expect(error.success).toBe(false)
    expect(error.detectedPlaceholders).toEqual(['<AC 1>'])
    expect(error.error).toContain('<AC 1>')
  })

  it('creates error with multiple placeholders', () => {
    const placeholders = ['<AC 1>', '<task-id>']
    const error = createPlaceholderError(placeholders)
    expect(error.success).toBe(false)
    expect(error.detectedPlaceholders).toEqual(['<AC 1>', '<task-id>'])
    expect(error.error).toContain('<AC 1>')
    expect(error.error).toContain('<task-id>')
  })

  it('handles empty placeholder array', () => {
    const error = createPlaceholderError([])
    expect(error.success).toBe(false)
    expect(error.detectedPlaceholders).toEqual([])
    expect(error.error).toContain('placeholder')
  })
})

describe('processTicketBody', () => {
  it('trims whitespace and normalizes body', () => {
    const body = '  \n## Goal\n\nTest goal\n  '
    const result = processTicketBody(body)
    expect(result.normalized).not.toMatch(/^\s+/)
    expect(result.normalized).not.toMatch(/\s+$/)
    expect(result.placeholders).toEqual([])
  })

  it('detects placeholders in body', () => {
    const body = '## Goal\n\n<AC 1> placeholder'
    const result = processTicketBody(body)
    expect(result.placeholders).toContain('<AC 1>')
  })

  it('normalizes title line when displayId provided', () => {
    const body = '- **Title**: Test Ticket\n\n## Goal\n\nTest'
    const result = processTicketBody(body, 'HAL-0012')
    expect(result.normalized).toContain('HAL-0012')
    expect(result.normalized).toContain('HAL-0012 — Test Ticket')
  })

  it('handles body without placeholders', () => {
    const body = '## Goal\n\nComplete test'
    const result = processTicketBody(body)
    expect(result.placeholders).toEqual([])
    expect(result.normalized.length).toBeGreaterThan(0)
  })
})

describe('formatTicketCreationResult', () => {
  it('formats result with all fields', () => {
    const created = { ticketId: 'HAL-0012', pk: 'pk-123' }
    const input = { title: 'Test Ticket' }
    const repoFullName = 'beardedphil/portfolio-2026-hal'
    // Create a body that's longer than 1500 chars to pass readiness check
    const longContent = '## Goal\n\nTest goal. ' + 'x'.repeat(1600)
    const normalizedBodyMd = longContent

    const result = formatTicketCreationResult(created, input, repoFullName, normalizedBodyMd)

    expect(result.id).toBe('0012')
    expect(result.display_id).toBe('HAL-0012')
    expect(result.ticket_number).toBe(12)
    expect(result.repo_full_name).toBe(repoFullName)
    expect(result.filename).toBe('0012-test-ticket.md')
    expect(result.filePath).toBe('supabase:tickets/HAL-0012')
    expect(result.ready).toBe(true)
  })

  it('includes missingItems when ticket is not ready', () => {
    const created = { ticketId: 'HAL-0012' }
    const input = { title: 'Short' }
    const repoFullName = 'beardedphil/portfolio-2026-hal'
    const normalizedBodyMd = 'Short' // Too short to be ready

    const result = formatTicketCreationResult(created, input, repoFullName, normalizedBodyMd)

    expect(result.ready).toBe(false)
    expect(result.missingItems).toBeDefined()
    expect(result.missingItems!.length).toBeGreaterThan(0)
  })

  it('handles ticket number parsing', () => {
    const created = { ticketId: 'HAL-0042' }
    const input = { title: 'Another Ticket' }
    const repoFullName = 'beardedphil/portfolio-2026-hal'
    const normalizedBodyMd = '## Goal\n\nTest goal with sufficient content to pass readiness check. This needs to be longer than the template baseline.'

    const result = formatTicketCreationResult(created, input, repoFullName, normalizedBodyMd)

    expect(result.ticket_number).toBe(42)
    expect(result.id).toBe('0042')
  })
})

describe('getRepoFullName', () => {
  it('returns projectId when provided and non-empty', () => {
    expect(getRepoFullName('owner/repo')).toBe('owner/repo')
    expect(getRepoFullName('  owner/repo  ')).toBe('owner/repo')
  })

  it('returns default when projectId is empty', () => {
    expect(getRepoFullName('')).toBe('beardedphil/portfolio-2026-hal')
    expect(getRepoFullName('   ')).toBe('beardedphil/portfolio-2026-hal')
  })

  it('returns default when projectId is undefined', () => {
    expect(getRepoFullName(undefined)).toBe('beardedphil/portfolio-2026-hal')
  })
})
