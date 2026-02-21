import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createTicketToolLogic,
  fetchTicketContentToolLogic,
  updateTicketBodyToolLogic,
} from './tools.js'
import { parseTicketNumber, slugFromTitle } from '../../lib/projectManagerHelpers.js'

describe('createTicketToolLogic', () => {
  const mockHalFetchJson = vi.fn()
  const mockToolCalls: Array<{ name: string; input: unknown; output: unknown }> = []
  const mockIsAbortError = vi.fn(() => false)
  const config = {
    projectId: 'beardedphil/portfolio-2026-hal',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockToolCalls.length = 0
  })

  it('rejects ticket creation when placeholders are detected', async () => {
    const input = {
      title: 'Test Ticket',
      body_md: 'This is a test with <placeholder> token',
    }

    const result = await createTicketToolLogic(input, {
      halFetchJson: mockHalFetchJson,
      toolCalls: mockToolCalls,
      isAbortError: mockIsAbortError,
      config,
      parseTicketNumber,
      slugFromTitle,
      normalizeBodyForReady: (body) => body,
      normalizeTitleLineInBody: (body, id) => body.replace('HAL-XXXX', id),
      evaluateTicketReady: vi.fn().mockReturnValue({
        ready: false,
        missingItems: [],
        checklistResults: {
          goal: false,
          deliverable: false,
          acceptanceCriteria: false,
          constraintsNonGoals: false,
          noPlaceholders: false,
        },
      }),
      COL_UNASSIGNED: 'col-unassigned',
      COL_TODO: 'col-todo',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('placeholder')
      expect(result.detectedPlaceholders).toContain('<placeholder>')
    }
    expect(mockHalFetchJson).not.toHaveBeenCalled()
  })

  it('creates ticket successfully when no placeholders are present', async () => {
    const input = {
      title: 'Test Ticket',
      body_md: '## Goal (one sentence)\n\nAdd a feature.\n\n## Acceptance criteria (UI-only)\n\n- [ ] Item 1',
    }

    mockHalFetchJson.mockResolvedValueOnce({
      ok: true,
      json: {
        success: true,
        ticketId: 'HAL-0123',
        pk: 'ticket-pk-123',
      },
    })

    mockHalFetchJson.mockResolvedValueOnce({
      ok: true,
      json: { success: true },
    })

    const mockEvaluateTicketReady = vi.fn().mockReturnValue({
      ready: true,
      missingItems: [],
      checklistResults: {
        goal: true,
        deliverable: true,
        acceptanceCriteria: true,
        constraintsNonGoals: true,
        noPlaceholders: true,
      },
    })

    mockHalFetchJson.mockResolvedValueOnce({
      ok: true,
      json: { success: true },
    })

    const result = await createTicketToolLogic(input, {
      halFetchJson: mockHalFetchJson,
      toolCalls: mockToolCalls,
      isAbortError: mockIsAbortError,
      config,
      parseTicketNumber,
      slugFromTitle,
      normalizeBodyForReady: (body) => body,
      normalizeTitleLineInBody: (body, id) => body.replace('HAL-XXXX', id),
      evaluateTicketReady: mockEvaluateTicketReady,
      COL_UNASSIGNED: 'col-unassigned',
      COL_TODO: 'col-todo',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.display_id).toBe('HAL-0123')
      expect(result.filename).toContain('test-ticket')
      expect(mockHalFetchJson).toHaveBeenCalled()
    }
  })

  it('handles ticket creation failure from API', async () => {
    const input = {
      title: 'Test Ticket',
      body_md: 'Valid body without placeholders',
    }

    mockHalFetchJson.mockResolvedValueOnce({
      ok: true,
      json: {
        success: false,
        error: 'API error',
      },
    })

    const result = await createTicketToolLogic(input, {
      halFetchJson: mockHalFetchJson,
      toolCalls: mockToolCalls,
      isAbortError: mockIsAbortError,
      config,
      parseTicketNumber,
      slugFromTitle,
      normalizeBodyForReady: (body) => body,
      normalizeTitleLineInBody: (body, id) => body.replace('HAL-XXXX', id),
      evaluateTicketReady: vi.fn().mockReturnValue({
        ready: false,
        missingItems: [],
        checklistResults: {
          goal: false,
          deliverable: false,
          acceptanceCriteria: false,
          constraintsNonGoals: false,
          noPlaceholders: false,
        },
      }),
      COL_UNASSIGNED: 'col-unassigned',
      COL_TODO: 'col-todo',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('API error')
    }
  })
})

describe('fetchTicketContentToolLogic', () => {
  const mockHalFetchJson = vi.fn()
  const mockToolCalls: Array<{ name: string; input: unknown; output: unknown }> = []
  const mockIsAbortError = vi.fn(() => false)

  beforeEach(() => {
    vi.clearAllMocks()
    mockToolCalls.length = 0
  })

  it('fetches ticket content successfully', async () => {
    const input = { ticket_id: 'HAL-0123' }

    mockHalFetchJson.mockResolvedValueOnce({
      ok: true,
      json: {
        success: true,
        ticket: {
          id: '0123',
          display_id: 'HAL-0123',
          ticket_number: 123,
          repo_full_name: 'beardedphil/portfolio-2026-hal',
          title: 'Test Ticket',
          body_md: 'Ticket body content',
          kanban_column_id: 'col-todo',
        },
        artifacts: [],
      },
    })

    const result = await fetchTicketContentToolLogic(
      input,
      {
        halFetchJson: mockHalFetchJson,
        toolCalls: mockToolCalls,
        isAbortError: mockIsAbortError,
        parseTicketNumber,
      }
    )

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.display_id).toBe('HAL-0123')
      expect(result.title).toBe('Test Ticket')
      expect(result.body_md).toBe('Ticket body content')
      expect(result.kanban_column_id).toBe('col-todo')
    }
  })

  it('handles ticket not found', async () => {
    const input = { ticket_id: 'HAL-9999' }

    mockHalFetchJson.mockResolvedValueOnce({
      ok: true,
      json: {
        success: false,
        error: 'Ticket not found',
      },
    })

    const result = await fetchTicketContentToolLogic(
      input,
      {
        halFetchJson: mockHalFetchJson,
        toolCalls: mockToolCalls,
        isAbortError: mockIsAbortError,
        parseTicketNumber,
      }
    )

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('Ticket not found')
    }
  })

  it('includes artifacts when present', async () => {
    const input = { ticket_id: 'HAL-0123' }

    mockHalFetchJson.mockResolvedValueOnce({
      ok: true,
      json: {
        success: true,
        ticket: {
          display_id: 'HAL-0123',
          title: 'Test Ticket',
          body_md: 'Body',
        },
        artifacts: [
          {
            artifact_id: 'art-1',
            ticket_pk: 'pk-1',
            title: 'Plan',
            body_md: 'Plan content',
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      },
    })

    const result = await fetchTicketContentToolLogic(
      input,
      {
        halFetchJson: mockHalFetchJson,
        toolCalls: mockToolCalls,
        isAbortError: mockIsAbortError,
        parseTicketNumber,
      }
    )

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.artifacts).toHaveLength(1)
      expect(result.artifacts[0].title).toBe('Plan')
    }
  })
})

describe('updateTicketBodyToolLogic', () => {
  const mockHalFetchJson = vi.fn()
  const mockToolCalls: Array<{ name: string; input: unknown; output: unknown }> = []
  const mockIsAbortError = vi.fn(() => false)

  beforeEach(() => {
    vi.clearAllMocks()
    mockToolCalls.length = 0
  })

  it('rejects update when placeholders are detected', async () => {
    const input = {
      ticket_id: 'HAL-0123',
      body_md: 'Updated body with <placeholder>',
    }

    const result = await updateTicketBodyToolLogic(input, {
      halFetchJson: mockHalFetchJson,
      toolCalls: mockToolCalls,
      isAbortError: mockIsAbortError,
      normalizeBodyForReady: (body) => body,
      normalizeTitleLineInBody: (body, id) => body.replace('HAL-XXXX', id),
      evaluateTicketReady: vi.fn().mockReturnValue({
        ready: false,
        missingItems: [],
        checklistResults: {
          goal: false,
          deliverable: false,
          acceptanceCriteria: false,
          constraintsNonGoals: false,
          noPlaceholders: false,
        },
      }),
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('placeholder')
      expect(result.detectedPlaceholders).toContain('<placeholder>')
    }
    expect(mockHalFetchJson).not.toHaveBeenCalled()
  })

  it('updates ticket body successfully when no placeholders', async () => {
    const input = {
      ticket_id: 'HAL-0123',
      body_md: 'Updated body without placeholders',
    }

    mockHalFetchJson.mockResolvedValueOnce({
      ok: true,
      json: {
        success: true,
        ticket: {
          display_id: 'HAL-0123',
          pk: 'ticket-pk-123',
        },
      },
    })

    mockHalFetchJson.mockResolvedValueOnce({
      ok: true,
      json: { success: true },
    })

    const mockEvaluateTicketReady = vi.fn().mockReturnValue({
      ready: true,
      missingItems: [],
      checklistResults: {
        goal: true,
        deliverable: true,
        acceptanceCriteria: true,
        constraintsNonGoals: true,
        noPlaceholders: true,
      },
    })

    const result = await updateTicketBodyToolLogic(input, {
      halFetchJson: mockHalFetchJson,
      toolCalls: mockToolCalls,
      isAbortError: mockIsAbortError,
      normalizeBodyForReady: (body) => body,
      normalizeTitleLineInBody: (body, id) => body.replace('HAL-XXXX', id),
      evaluateTicketReady: mockEvaluateTicketReady,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.ticketId).toBe('HAL-0123')
      expect(result.ready).toBe(true)
    }
  })

  it('handles ticket not found during update', async () => {
    const input = {
      ticket_id: 'HAL-9999',
      body_md: 'Valid body',
    }

    mockHalFetchJson.mockResolvedValueOnce({
      ok: true,
      json: {
        success: false,
        error: 'Ticket not found',
      },
    })

    const result = await updateTicketBodyToolLogic(input, {
      halFetchJson: mockHalFetchJson,
      toolCalls: mockToolCalls,
      isAbortError: mockIsAbortError,
      normalizeBodyForReady: (body) => body,
      normalizeTitleLineInBody: (body, id) => body.replace('HAL-XXXX', id),
      evaluateTicketReady: vi.fn().mockReturnValue({
        ready: false,
        missingItems: [],
        checklistResults: {
          goal: false,
          deliverable: false,
          acceptanceCriteria: false,
          constraintsNonGoals: false,
          noPlaceholders: false,
        },
      }),
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('Ticket not found')
    }
  })
})
