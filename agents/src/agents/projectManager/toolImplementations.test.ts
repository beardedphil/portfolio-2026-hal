import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  validatePlaceholders,
  createTicketLogic,
  updateTicketBodyLogic,
  createRedDocumentLogic,
} from './toolImplementations.js'

describe('toolImplementations', () => {
  describe('validatePlaceholders', () => {
    it('detects placeholder tokens in body text', () => {
      const body = 'This is a ticket with <placeholder> and <another-placeholder>'
      const result = validatePlaceholders(body)
      expect(result.hasPlaceholders).toBe(true)
      expect(result.placeholders).toContain('<placeholder>')
      expect(result.placeholders).toContain('<another-placeholder>')
    })

    it('returns empty array when no placeholders found', () => {
      const body = 'This is a normal ticket body without placeholders'
      const result = validatePlaceholders(body)
      expect(result.hasPlaceholders).toBe(false)
      expect(result.placeholders).toEqual([])
    })

    it('handles duplicate placeholders by returning unique set', () => {
      const body = 'Body with <placeholder> and <placeholder> again'
      const result = validatePlaceholders(body)
      expect(result.hasPlaceholders).toBe(true)
      expect(result.placeholders).toEqual(['<placeholder>'])
    })
  })

  describe('createTicketLogic', () => {
    const mockHalFetchJson = vi.fn()
    const mockConfig = {
      projectId: 'test/repo',
    }
    const mockToolCalls: Array<{ name: string; input: unknown; output: unknown }> = []

    beforeEach(() => {
      vi.clearAllMocks()
      mockToolCalls.length = 0
    })

    it('rejects ticket creation when placeholders are detected', async () => {
      const input = {
        title: 'Test Ticket',
        body_md: 'Body with <placeholder>',
      }

      const result = await createTicketLogic(
        input,
        mockConfig,
        mockHalFetchJson,
        mockToolCalls,
        vi.fn()
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('placeholder')
      expect(result.detectedPlaceholders).toContain('<placeholder>')
      expect(mockHalFetchJson).not.toHaveBeenCalled()
    })

    it('creates ticket successfully when body is valid', async () => {
      const input = {
        title: 'Test Ticket',
        body_md: '## Goal (one sentence)\n\nTest goal.\n\n## Acceptance criteria (UI-only)\n\n- [ ] Test AC',
      }

      mockHalFetchJson
        .mockResolvedValueOnce({
          ok: true,
          json: {
            success: true,
            ticketId: 'HAL-0123',
            pk: 'ticket-pk-123',
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          json: { success: true },
        })
        .mockResolvedValueOnce({
          ok: true,
          json: { success: true },
        })

      const result = await createTicketLogic(
        input,
        mockConfig,
        mockHalFetchJson,
        mockToolCalls,
        vi.fn()
      )

      expect(result.success).toBe(true)
      expect(mockHalFetchJson).toHaveBeenCalled()
    })

    it('evaluates ticket readiness after creation', async () => {
      const input = {
        title: 'Test Ticket',
        body_md: '## Goal (one sentence)\n\nTest goal.\n\n## Acceptance criteria (UI-only)\n\n- [ ] Test AC',
      }

      mockHalFetchJson
        .mockResolvedValueOnce({
          ok: true,
          json: {
            success: true,
            ticketId: 'HAL-0123',
            pk: 'ticket-pk-123',
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          json: { success: true },
        })
        .mockResolvedValueOnce({
          ok: true,
          json: { success: true },
        })

      const result = await createTicketLogic(
        input,
        mockConfig,
        mockHalFetchJson,
        mockToolCalls,
        vi.fn()
      )

      expect(result.success).toBe(true)
      expect('ready' in result && result.ready !== undefined).toBe(true)
    })
  })

  describe('updateTicketBodyLogic', () => {
    const mockHalFetchJson = vi.fn()
    const mockToolCalls: Array<{ name: string; input: unknown; output: unknown }> = []

    beforeEach(() => {
      vi.clearAllMocks()
      mockToolCalls.length = 0
    })

    it('rejects update when placeholders are detected', async () => {
      const input = {
        ticket_id: 'HAL-0123',
        body_md: 'Body with <placeholder>',
      }

      const result = await updateTicketBodyLogic(
        input,
        mockHalFetchJson,
        mockToolCalls,
        vi.fn()
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('placeholder')
      expect(result.detectedPlaceholders).toContain('<placeholder>')
      expect(mockHalFetchJson).not.toHaveBeenCalled()
    })

    it('updates ticket body successfully when valid', async () => {
      const input = {
        ticket_id: 'HAL-0123',
        body_md: '## Goal (one sentence)\n\nTest goal.\n\n## Acceptance criteria (UI-only)\n\n- [ ] Test AC',
      }

      mockHalFetchJson
        .mockResolvedValueOnce({
          ok: true,
          json: {
            success: true,
            ticket: {
              display_id: 'HAL-0123',
              pk: 'ticket-pk-123',
            },
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          json: { success: true },
        })

      const result = await updateTicketBodyLogic(
        input,
        mockHalFetchJson,
        mockToolCalls,
        vi.fn()
      )

      expect(result.success).toBe(true)
      expect(mockHalFetchJson).toHaveBeenCalledTimes(2)
    })

    it('evaluates readiness after update', async () => {
      const input = {
        ticket_id: 'HAL-0123',
        body_md: '## Goal (one sentence)\n\nTest goal.\n\n## Acceptance criteria (UI-only)\n\n- [ ] Test AC',
      }

      mockHalFetchJson
        .mockResolvedValueOnce({
          ok: true,
          json: {
            success: true,
            ticket: {
              display_id: 'HAL-0123',
              pk: 'ticket-pk-123',
            },
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          json: { success: true },
        })

      const result = await updateTicketBodyLogic(
        input,
        mockHalFetchJson,
        mockToolCalls,
        vi.fn()
      )

      expect(result.success).toBe(true)
      expect('ready' in result && result.ready !== undefined).toBe(true)
    })
  })

  describe('createRedDocumentLogic', () => {
    const mockHalFetchJson = vi.fn()
    const mockToolCalls: Array<{ name: string; input: unknown; output: unknown }> = []

    beforeEach(() => {
      vi.clearAllMocks()
      mockToolCalls.length = 0
    })

    it('returns existing RED when one already exists (idempotency)', async () => {
      const input = {
        ticket_id: 'HAL-0123',
        red_json_content: JSON.stringify({ summary: 'Test RED' }),
      }

      mockHalFetchJson
        .mockResolvedValueOnce({
          ok: true,
          json: {
            success: true,
            ticket: {
              pk: 'ticket-pk-123',
              repo_full_name: 'test/repo',
            },
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          json: {
            success: true,
            red_versions: [
              {
                red_id: 'red-123',
                version: 1,
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          json: { success: true },
        })
        .mockResolvedValueOnce({
          ok: true,
          json: {
            success: true,
            red_document: {
              red_json: { summary: 'Test RED' },
              created_at: '2026-01-01T00:00:00Z',
              version: 1,
              validation_status: 'pending',
            },
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          json: { success: true },
        })

      const result = await createRedDocumentLogic(
        input,
        mockHalFetchJson,
        mockToolCalls,
        vi.fn()
      )

      expect(result.success).toBe(true)
      expect(result.red_document).toBeDefined()
      expect(result.red_document.red_id).toBe('red-123')
    })

    it('creates new RED when none exists', async () => {
      const input = {
        ticket_id: 'HAL-0123',
        red_json_content: JSON.stringify({ summary: 'Test RED' }),
      }

      mockHalFetchJson
        .mockResolvedValueOnce({
          ok: true,
          json: {
            success: true,
            ticket: {
              pk: 'ticket-pk-123',
              repo_full_name: 'test/repo',
            },
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          json: {
            success: true,
            red_versions: [],
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          json: {
            success: true,
            red_document: {
              red_id: 'red-456',
              version: 1,
            },
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          json: { success: true },
        })
        .mockResolvedValueOnce({
          ok: true,
          json: { success: true },
        })

      const result = await createRedDocumentLogic(
        input,
        mockHalFetchJson,
        mockToolCalls,
        vi.fn()
      )

      expect(result.success).toBe(true)
      expect(result.red_document.red_id).toBe('red-456')
    })

    it('rejects invalid JSON in red_json_content', async () => {
      const input = {
        ticket_id: 'HAL-0123',
        red_json_content: 'invalid json {',
      }

      mockHalFetchJson
        .mockResolvedValueOnce({
          ok: true,
          json: {
            success: true,
            ticket: {
              pk: 'ticket-pk-123',
              repo_full_name: 'test/repo',
            },
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          json: {
            success: true,
            red_versions: [],
          },
        })

      const result = await createRedDocumentLogic(
        input,
        mockHalFetchJson,
        mockToolCalls,
        vi.fn()
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid JSON')
    })
  })
})
