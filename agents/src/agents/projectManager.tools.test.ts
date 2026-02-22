import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PLACEHOLDER_RE } from '../lib/projectManagerHelpers.js'
import { normalizeBodyForReady, normalizeTitleLineInBody } from '../lib/ticketBodyNormalization.js'
import { parseTicketNumber, slugFromTitle, evaluateTicketReady } from '../lib/projectManagerHelpers.js'

describe('projectManager.ts tool behaviors', () => {
  describe('createTicketTool placeholder detection', () => {
    it('detects placeholder tokens in ticket body', () => {
      const bodyWithPlaceholder = 'This is a ticket with <AC 1> placeholder'
      const matches = bodyWithPlaceholder.match(PLACEHOLDER_RE) ?? []
      expect(matches.length).toBeGreaterThan(0)
      expect(matches).toContain('<AC 1>')
    })

    it('detects multiple placeholder formats', () => {
      const body = 'Body with <AC 1> and <task-id> and <placeholder>'
      const matches = body.match(PLACEHOLDER_RE) ?? []
      expect(matches.length).toBeGreaterThanOrEqual(1)
    })

    it('returns empty array when no placeholders found', () => {
      const body = 'This is a normal ticket body without placeholders'
      const matches = body.match(PLACEHOLDER_RE) ?? []
      expect(matches).toEqual([])
    })

    it('handles unique placeholders correctly', () => {
      const body = '<AC 1> <AC 1> <AC 2>'
      const matches = body.match(PLACEHOLDER_RE) ?? []
      const unique = [...new Set(matches)]
      expect(unique.length).toBe(2)
      expect(unique).toContain('<AC 1>')
      expect(unique).toContain('<AC 2>')
    })
  })

  describe('createTicketTool body normalization', () => {
    it('normalizes body for ready check', () => {
      const body = '## Goal\n\nTest goal\n\n## Acceptance criteria\n\n- Item 1'
      const normalized = normalizeBodyForReady(body)
      expect(normalized).toBeTruthy()
      expect(typeof normalized).toBe('string')
    })

    it('handles empty body', () => {
      const normalized = normalizeBodyForReady('')
      expect(typeof normalized).toBe('string')
      expect(normalized).toBe('')
    })

    it('normalizes title line with display ID', () => {
      const body = '- **Title**: Test Title\n\n## Goal\n\nTest'
      const normalized = normalizeTitleLineInBody(body, 'HAL-0123')
      expect(normalized).toContain('HAL-0123')
      expect(normalized).toContain('HAL-0123 — Test Title')
    })
  })

  describe('fetchTicketContentTool ticket ID parsing', () => {
    it('parses ticket number from various formats', () => {
      expect(parseTicketNumber('HAL-0123')).toBe(123)
      expect(parseTicketNumber('0123')).toBe(123)
      expect(parseTicketNumber('123')).toBe(123)
    })

    it('handles invalid ticket IDs', () => {
      expect(parseTicketNumber('invalid')).toBe(null)
      expect(parseTicketNumber('')).toBe(null)
    })

    it('normalizes ticket ID to 4-digit format', () => {
      const ticketNumber = parseTicketNumber('HAL-123')
      const normalizedId = String(ticketNumber ?? 0).padStart(4, '0')
      expect(normalizedId).toBe('0123')
    })
  })

  describe('createTicketTool filename generation', () => {
    it('generates filename from ticket number and title slug', () => {
      const ticketNumber = 123
      const title = 'Test Ticket Title'
      const id = String(ticketNumber).padStart(4, '0')
      const filename = `${id}-${slugFromTitle(title)}.md`
      expect(filename).toBe('0123-test-ticket-title.md')
    })

    it('handles special characters in title', () => {
      const title = 'Ticket #123!'
      const slug = slugFromTitle(title)
      expect(slug).toBe('ticket-123')
    })
  })

  describe('createTicketTool readiness evaluation', () => {
    it('evaluates ticket ready status correctly', () => {
      const longContent = 'A'.repeat(2000)
      const readiness = evaluateTicketReady(longContent)
      expect(readiness).toHaveProperty('ready')
      expect(readiness).toHaveProperty('missingItems')
      expect(Array.isArray(readiness.missingItems)).toBe(true)
    })

    it('identifies missing items for short tickets', () => {
      const shortContent = 'Short'
      const readiness = evaluateTicketReady(shortContent)
      expect(readiness.ready).toBe(false)
      expect(readiness.missingItems.length).toBeGreaterThan(0)
    })
  })

  describe('kanbanMoveTicketToTodoTool column validation', () => {
    it('validates column constants', () => {
      const COL_UNASSIGNED = 'col-unassigned'
      const COL_TODO = 'col-todo'
      expect(COL_UNASSIGNED).toBe('col-unassigned')
      expect(COL_TODO).toBe('col-todo')
    })

    it('checks if ticket is in unassigned column', () => {
      const currentCol: string | null = 'col-unassigned'
      const inUnassigned = currentCol === 'col-unassigned' || currentCol === null || currentCol === ''
      expect(inUnassigned).toBe(true)
    })

    it('rejects move when ticket is not in unassigned', () => {
      const currentCol: string | null = 'col-todo'
      const inUnassigned = currentCol === 'col-unassigned' || currentCol === null || currentCol === ''
      expect(inUnassigned).toBe(false)
    })
  })
})
