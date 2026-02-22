/**
 * Tests for agent launch endpoint behavior.
 * 
 * These tests verify that:
 * - Ticket body parsing extracts goal, deliverable, and acceptance criteria correctly
 * - Prompt text is built correctly for implementation agents
 * - Prompt text is built correctly for QA agents
 * - Branch name is extracted correctly from ticket body for QA agents
 * - Agent type is determined correctly from request body
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseTicketBody,
  buildImplementationPrompt,
  buildQAPrompt,
  extractBranchName,
  determineAgentType,
  moveQATicketToDoing,
  createCursorRunRow,
  updateRunStages,
} from './launch.js'
import type { SupabaseClient } from '@supabase/supabase-js'

describe('parseTicketBody', () => {
  it('should extract goal, deliverable, and acceptance criteria from ticket body', () => {
    const bodyMd = `## Goal (one sentence)

Add a feature to the app.

## Human-verifiable deliverable (UI-only)

User sees a button.

## Acceptance criteria (UI-only)

- [ ] Button is visible
- [ ] Button is clickable
- [ ] Clicking shows a message`

    const { goal, deliverable, criteria } = parseTicketBody(bodyMd)

    expect(goal).toBe('Add a feature to the app.')
    expect(deliverable).toBe('User sees a button.')
    expect(criteria).toContain('- [ ] Button is visible')
  })

  it('should handle missing sections gracefully', () => {
    const bodyMd = `## Goal (one sentence)

Add a feature.`

    const { goal, deliverable, criteria } = parseTicketBody(bodyMd)

    expect(goal).toBe('Add a feature.')
    expect(deliverable).toBe('')
    expect(criteria).toBe('')
  })

  it('should handle empty ticket body', () => {
    const bodyMd = ''

    const { goal, deliverable, criteria } = parseTicketBody(bodyMd)

    expect(goal).toBe('')
    expect(deliverable).toBe('')
    expect(criteria).toBe('')
  })
})

describe('buildImplementationPrompt', () => {
  it('should build correct prompt text for implementation agent', () => {
    const params = {
      repoFullName: 'test/repo',
      ticketNumber: 123,
      displayId: 'HAL-0123',
      currentColumnId: 'col-doing',
      defaultBranch: 'main',
      halApiBaseUrl: 'https://example.com',
      goal: 'Add a feature',
      deliverable: 'User sees a button',
      criteria: '- [ ] Button is visible',
    }

    const promptText = buildImplementationPrompt(params)

    expect(promptText).toContain('Implement this ticket.')
    expect(promptText).toContain('test/repo')
    expect(promptText).toContain('HAL-0123')
    expect(promptText).toContain('col-doing')
    expect(promptText).toContain('Add a feature')
    expect(promptText).toContain('User sees a button')
    expect(promptText).toContain('- [ ] Button is visible')
  })

  it('should use default values for missing fields', () => {
    const params = {
      repoFullName: 'test/repo',
      ticketNumber: 123,
      displayId: 'HAL-0123',
      currentColumnId: null,
      defaultBranch: 'main',
      halApiBaseUrl: 'https://example.com',
      goal: '',
      deliverable: '',
      criteria: '',
    }

    const promptText = buildImplementationPrompt(params)

    expect(promptText).toContain('col-unassigned')
    expect(promptText).toContain('(not specified)')
  })
})

describe('buildQAPrompt', () => {
  it('should build correct prompt text for QA agent', () => {
    const params = {
      repoFullName: 'test/repo',
      ticketNumber: 123,
      displayId: 'HAL-0123',
      currentColumnId: 'col-qa',
      defaultBranch: 'main',
      halApiBaseUrl: 'https://example.com',
      goal: 'Add a feature',
      deliverable: 'User sees a button',
      criteria: '- [ ] Button is visible',
    }

    const promptText = buildQAPrompt(params)

    expect(promptText).toContain('QA this ticket implementation')
    expect(promptText).toContain('test/repo')
    expect(promptText).toContain('HAL-0123')
    expect(promptText).toContain('col-qa')
    expect(promptText).toContain('Load Your Instructions First')
    expect(promptText).toContain('Add a feature')
  })
})

describe('extractBranchName', () => {
  it('should extract branch name from QA ticket body', () => {
    const bodyMd = `## QA

Branch: feature/my-branch

Some other content.`

    const branchName = extractBranchName(bodyMd)

    expect(branchName).toBe('feature/my-branch')
  })

  it('should return undefined when branch is not found', () => {
    const bodyMd = `## QA

Some content without branch.`

    const branchName = extractBranchName(bodyMd)

    expect(branchName).toBeUndefined()
  })

  it('should handle branch name with spaces', () => {
    const bodyMd = `## QA

Branch: feature/my branch name`

    const branchName = extractBranchName(bodyMd)

    expect(branchName).toBe('feature/my branch name')
  })
})

describe('determineAgentType', () => {
  it('should return correct agent type from request body', () => {
    const testCases = [
      { body: { agentType: 'qa' }, expected: 'qa' },
      { body: { agentType: 'project-manager' }, expected: 'project-manager' },
      { body: { agentType: 'process-review' }, expected: 'process-review' },
      { body: { agentType: 'implementation' }, expected: 'implementation' },
      { body: {}, expected: 'implementation' },
      { body: { agentType: 'invalid' }, expected: 'implementation' },
    ]

    testCases.forEach(({ body, expected }) => {
      const agentType = determineAgentType(body as any)
      expect(agentType).toBe(expected)
    })
  })
})

describe('moveQATicketToDoing', () => {
  it('should move QA ticket from QA column to Doing column', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [{ kanban_position: 5 }],
        error: null,
      }),
      update: vi.fn().mockReturnThis(),
    } as unknown as SupabaseClient<any, 'public', any>

    await moveQATicketToDoing(mockSupabase, 'test/repo', 'ticket-pk', 'HAL-0123')

    expect(mockSupabase.from).toHaveBeenCalledWith('tickets')
    expect(mockSupabase.update).toHaveBeenCalled()
  })

  it('should handle errors gracefully without throwing', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockRejectedValue(new Error('Database error')),
    } as unknown as SupabaseClient<any, 'public', any>

    await expect(moveQATicketToDoing(mockSupabase, 'test/repo', 'ticket-pk', 'HAL-0123')).resolves.not.toThrow()
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('should calculate next position correctly when Doing column has tickets', async () => {
    const mockUpdate = vi.fn().mockResolvedValue({ error: null })
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [{ kanban_position: 10 }],
        error: null,
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    } as unknown as SupabaseClient<any, 'public', any>

    await moveQATicketToDoing(mockSupabase, 'test/repo', 'ticket-pk', 'HAL-0123')

    expect(mockSupabase.update).toHaveBeenCalled()
  })
})

describe('createCursorRunRow', () => {
  it('should create a run row with correct properties for implementation agent', async () => {
    const mockRunId = 'run-123'
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { run_id: mockRunId },
        error: null,
      }),
    } as unknown as SupabaseClient<any, 'public', any>

    const result = await createCursorRunRow(
      mockSupabase,
      'implementation',
      'test/repo',
      'ticket-pk',
      123,
      'HAL-0123'
    )

    expect(result.runId).toBe(mockRunId)
    expect(result.initialProgress).toBeDefined()
    expect(result.initialProgress.length).toBeGreaterThan(0)
    expect(mockSupabase.from).toHaveBeenCalledWith('hal_agent_runs')
  })

  it('should create a run row with correct properties for QA agent', async () => {
    const mockRunId = 'run-456'
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { run_id: mockRunId },
        error: null,
      }),
    } as unknown as SupabaseClient<any, 'public', any>

    const result = await createCursorRunRow(mockSupabase, 'qa', 'test/repo', 'ticket-pk', 456, 'HAL-0456')

    expect(result.runId).toBe(mockRunId)
    expect(result.initialProgress[0].message).toContain('qa')
  })

  it('should throw an error if run row creation fails', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Insert failed' },
      }),
    } as unknown as SupabaseClient<any, 'public', any>

    await expect(
      createCursorRunRow(mockSupabase, 'implementation', 'test/repo', 'ticket-pk', 123, 'HAL-0123')
    ).rejects.toThrow('Failed to create run row')
  })
})

describe('updateRunStages', () => {
  it('should update stages correctly for implementation agent', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    } as unknown as SupabaseClient<any, 'public', any>

    const initialProgress = [{ at: '2024-01-01T00:00:00Z', message: 'Starting' }]

    await updateRunStages(mockSupabase, 'run-123', 'implementation', 'body content', initialProgress)

    expect(mockSupabase.from).toHaveBeenCalledWith('hal_agent_runs')
    expect(mockSupabase.update).toHaveBeenCalledTimes(2) // fetching_ticket and resolving_repo
  })

  it('should update stages correctly for QA agent with branch name', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    } as unknown as SupabaseClient<any, 'public', any>

    const initialProgress = [{ at: '2024-01-01T00:00:00Z', message: 'Starting' }]
    const bodyMd = `## QA\n\nBranch: feature/test-branch\n\nContent`

    await updateRunStages(mockSupabase, 'run-123', 'qa', bodyMd, initialProgress)

    expect(mockSupabase.from).toHaveBeenCalledWith('hal_agent_runs')
    expect(mockSupabase.update).toHaveBeenCalledTimes(2) // fetching_ticket and fetching_branch
  })

  it('should update stages correctly for QA agent without branch name', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    } as unknown as SupabaseClient<any, 'public', any>

    const initialProgress = [{ at: '2024-01-01T00:00:00Z', message: 'Starting' }]
    const bodyMd = `## QA\n\nNo branch specified`

    await updateRunStages(mockSupabase, 'run-123', 'qa', bodyMd, initialProgress)

    expect(mockSupabase.from).toHaveBeenCalledWith('hal_agent_runs')
    expect(mockSupabase.update).toHaveBeenCalledTimes(2) // fetching_ticket and fetching_branch
  })
})
