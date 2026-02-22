/**
 * Unit tests for projectManager tool helpers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validatePlaceholders, executeCreateTicket, executeFetchTicketContent } from './toolHelpers.js'
import { halFetchJson } from './halApi.js'
import { normalizeBodyForReady, normalizeTitleLineInBody } from '../../lib/ticketBodyNormalization.js'
import { evaluateTicketReady, parseTicketNumber, slugFromTitle } from '../../lib/projectManagerHelpers.js'

// Mock dependencies
vi.mock('./halApi.js', () => ({
  halFetchJson: vi.fn(),
}))

vi.mock('../../lib/ticketBodyNormalization.js', () => ({
  normalizeBodyForReady: vi.fn((body: string) => body.trim()),
  normalizeTitleLineInBody: vi.fn((body: string, id: string) => body),
}))

vi.mock('../../lib/projectManagerHelpers.js', () => ({
  PLACEHOLDER_RE: /<[A-Za-z0-9\s\-_]+>/g,
  slugFromTitle: vi.fn((title: string) => title.toLowerCase().replace(/\s+/g, '-')),
  parseTicketNumber: vi.fn((id: string) => {
    const match = id.match(/(\d+)/)
    return match ? parseInt(match[1], 10) : null
  }),
  evaluateTicketReady: vi.fn((body: string) => ({
    ready: body.length > 1500,
    missingItems: body.length <= 1500 ? ['Ticket content is too short'] : [],
    checklistResults: {},
  })),
}))

describe('toolHelpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('validatePlaceholders', () => {
    it('should return valid: true for body without placeholders', () => {
      const result = validatePlaceholders('This is a normal ticket body.')
      expect(result.valid).toBe(true)
      expect(result.placeholders).toBeUndefined()
    })

    it('should return valid: false and list placeholders when found', () => {
      const result = validatePlaceholders('Ticket body with <PLACEHOLDER> and <ANOTHER> tokens.')
      expect(result.valid).toBe(false)
      expect(result.placeholders).toEqual(['<PLACEHOLDER>', '<ANOTHER>'])
    })

    it('should deduplicate placeholders', () => {
      const result = validatePlaceholders('Body with <SAME> and <SAME> repeated.')
      expect(result.valid).toBe(false)
      expect(result.placeholders).toEqual(['<SAME>'])
    })
  })

  describe('executeCreateTicket', () => {
    const mockConfig = {
      projectId: 'test/repo',
      abortSignal: undefined,
      onProgress: undefined,
    }
    const mockHalBaseUrl = 'https://test.hal.app'

    it('should reject tickets with placeholders', async () => {
      const result = await executeCreateTicket(
        { title: 'Test', body_md: 'Body with <PLACEHOLDER>' },
        mockConfig,
        mockHalBaseUrl
      )
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.detectedPlaceholders).toContain('<PLACEHOLDER>')
      }
    })

    it('should create ticket successfully', async () => {
      vi.mocked(normalizeBodyForReady).mockReturnValue('normalized body')
      const halFetchJsonMock = vi.mocked(halFetchJson)
      halFetchJsonMock.mockResolvedValueOnce({
        ok: true,
        json: { success: true, ticketId: 'HAL-0123', pk: 'pk-123' },
      })
      halFetchJsonMock.mockResolvedValueOnce({
        ok: true,
        json: { success: true },
      })
      halFetchJsonMock.mockResolvedValueOnce({
        ok: true,
        json: { success: true },
      })
      vi.mocked(parseTicketNumber).mockReturnValue(123)
      vi.mocked(slugFromTitle).mockReturnValue('test-ticket')
      vi.mocked(normalizeTitleLineInBody).mockReturnValue('normalized with title')
      vi.mocked(evaluateTicketReady).mockReturnValue({ ready: true, missingItems: [] })

      const result = await executeCreateTicket(
        { title: 'Test Ticket', body_md: 'Valid body content' },
        mockConfig,
        mockHalBaseUrl
      )

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.id).toBe('0123')
        expect(result.display_id).toBe('HAL-0123')
      }
    })
  })

  describe('executeFetchTicketContent', () => {
    const mockHalBaseUrl = 'https://test.hal.app'
    const mockOpts = {
      abortSignal: undefined,
      onProgress: undefined,
    }

    it('should fetch ticket content successfully', async () => {
      vi.mocked(halFetchJson).mockResolvedValue({
        ok: true,
        json: {
          success: true,
          ticket: { id: '0123', display_id: 'HAL-0123', title: 'Test', body_md: 'Content' },
          artifacts: [],
        },
      })
      vi.mocked(parseTicketNumber).mockReturnValue(123)

      const result = await executeFetchTicketContent({ ticket_id: 'HAL-0123' }, mockHalBaseUrl, mockOpts)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.id).toBe('0123')
        expect(result.title).toBe('Test')
      }
    })

    it('should return error when ticket not found', async () => {
      vi.mocked(halFetchJson).mockResolvedValue({
        ok: false,
        json: { success: false, error: 'Not found' },
      })

      const result = await executeFetchTicketContent({ ticket_id: 'HAL-9999' }, mockHalBaseUrl, mockOpts)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.toLowerCase()).toContain('not found')
      }
    })
  })
})
