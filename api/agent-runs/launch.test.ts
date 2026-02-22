import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseTicketBodySections,
  buildImplementationPrompt,
  buildQAPrompt,
  determineBranchName,
  checkForExistingPrUrl,
  parseAgentType,
  validateLaunchInputs,
  checkForExistingActiveRun,
  moveQATicketToDoing,
} from './launch-helpers.js'

describe('parseTicketBodySections', () => {
  it('extracts goal, deliverable, and criteria from ticket body', () => {
    const bodyMd = `## Goal (one sentence)

Add a feature.

## Human-verifiable deliverable (UI-only)

User sees a button.

## Acceptance criteria (UI-only)

- [ ] Item 1
- [ ] Item 2`

    const result = parseTicketBodySections(bodyMd)
    expect(result.goal).toBe('Add a feature.')
    expect(result.deliverable).toBe('User sees a button.')
    expect(result.criteria).toBe('- [ ] Item 1\n- [ ] Item 2')
  })

  it('handles missing sections gracefully', () => {
    const bodyMd = `## Goal (one sentence)

Add a feature.`

    const result = parseTicketBodySections(bodyMd)
    expect(result.goal).toBe('Add a feature.')
    expect(result.deliverable).toBe('')
    expect(result.criteria).toBe('')
  })

  it('handles empty ticket body', () => {
    const result = parseTicketBodySections('')
    expect(result.goal).toBe('')
    expect(result.deliverable).toBe('')
    expect(result.criteria).toBe('')
  })

  it('extracts sections with different heading formats', () => {
    const bodyMd = `## Goal

Add a feature.

## Human-verifiable deliverable

User sees a button.

## Acceptance criteria

- [ ] Item 1`

    const result = parseTicketBodySections(bodyMd)
    expect(result.goal).toBe('Add a feature.')
    expect(result.deliverable).toBe('User sees a button.')
    expect(result.criteria).toBe('- [ ] Item 1')
  })

  it('trims whitespace from extracted sections', () => {
    const bodyMd = `## Goal (one sentence)

  Add a feature with spaces.  

## Human-verifiable deliverable (UI-only)

  User sees a button.  

## Acceptance criteria (UI-only)

  - [ ] Item 1  `

    const result = parseTicketBodySections(bodyMd)
    expect(result.goal).toBe('Add a feature with spaces.')
    expect(result.deliverable).toBe('User sees a button.')
    expect(result.criteria).toBe('- [ ] Item 1')
  })
})

describe('buildImplementationPrompt', () => {
  it('builds prompt with all required sections', () => {
    const params = {
      repoFullName: 'test/repo',
      ticketNumber: 123,
      displayId: 'HAL-0123',
      currentColumnId: 'col-doing',
      defaultBranch: 'main',
      halApiBaseUrl: 'https://example.com',
      goal: 'Add a feature',
      deliverable: 'User sees a button',
      criteria: '- [ ] Item 1',
    }

    const prompt = buildImplementationPrompt(params)
    expect(prompt).toContain('Implement this ticket.')
    expect(prompt).toContain('**ID**: HAL-0123')
    expect(prompt).toContain('**Repo**: test/repo')
    expect(prompt).toContain('**ticketNumber**: 123')
    expect(prompt).toContain('**displayId**: HAL-0123')
    expect(prompt).toContain('**currentColumnId**: col-doing')
    expect(prompt).toContain('**defaultBranch**: main')
    expect(prompt).toContain('**HAL API base URL**: https://example.com')
    expect(prompt).toContain('## Goal')
    expect(prompt).toContain('Add a feature')
    expect(prompt).toContain('## Human-verifiable deliverable')
    expect(prompt).toContain('User sees a button')
    expect(prompt).toContain('## Acceptance criteria')
    expect(prompt).toContain('- [ ] Item 1')
  })

  it('uses default values for missing sections', () => {
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

    const prompt = buildImplementationPrompt(params)
    expect(prompt).toContain('**currentColumnId**: col-unassigned')
    expect(prompt).toContain('(not specified)')
  })

  it('includes existing PR URL when provided', () => {
    const params = {
      repoFullName: 'test/repo',
      ticketNumber: 123,
      displayId: 'HAL-0123',
      currentColumnId: 'col-doing',
      defaultBranch: 'main',
      halApiBaseUrl: 'https://example.com',
      goal: 'Add a feature',
      deliverable: 'User sees a button',
      criteria: '- [ ] Item 1',
      existingPrUrl: 'https://github.com/test/repo/pull/1',
    }

    const prompt = buildImplementationPrompt(params)
    expect(prompt).toContain('## Existing PR linked')
    expect(prompt).toContain('https://github.com/test/repo/pull/1')
    expect(prompt).toContain('Do NOT create a new PR')
  })
})

describe('buildQAPrompt', () => {
  it('builds prompt with all required sections', () => {
    const params = {
      repoFullName: 'test/repo',
      ticketNumber: 123,
      displayId: 'HAL-0123',
      currentColumnId: 'col-qa',
      defaultBranch: 'main',
      halApiBaseUrl: 'https://example.com',
      goal: 'Add a feature',
      deliverable: 'User sees a button',
      criteria: '- [ ] Item 1',
    }

    const prompt = buildQAPrompt(params)
    expect(prompt).toContain('QA this ticket implementation')
    expect(prompt).toContain('**ID**: HAL-0123')
    expect(prompt).toContain('**Repo**: test/repo')
    expect(prompt).toContain('## Goal')
    expect(prompt).toContain('Add a feature')
    expect(prompt).toContain('## Human-verifiable deliverable')
    expect(prompt).toContain('User sees a button')
    expect(prompt).toContain('## Acceptance criteria')
    expect(prompt).toContain('- [ ] Item 1')
  })

  it('includes instructions loading section', () => {
    const params = {
      repoFullName: 'test/repo',
      ticketNumber: 123,
      displayId: 'HAL-0123',
      currentColumnId: 'col-qa',
      defaultBranch: 'main',
      halApiBaseUrl: 'https://example.com',
      goal: 'Add a feature',
      deliverable: 'User sees a button',
      criteria: '- [ ] Item 1',
    }

    const prompt = buildQAPrompt(params)
    expect(prompt).toContain('## MANDATORY: Load Your Instructions First')
    expect(prompt).toContain('BEFORE starting any QA work')
    expect(prompt).toContain('/api/instructions/get')
  })
})

describe('determineBranchName', () => {
  it('returns ticket branch for implementation agent', () => {
    const result = determineBranchName('implementation', 123)
    expect(result).toBe('ticket/0123-implementation')
  })

  it('pads ticket number with zeros', () => {
    const result = determineBranchName('implementation', 5)
    expect(result).toBe('ticket/0005-implementation')
  })

  it('returns default branch for QA agent', () => {
    const result = determineBranchName('qa', 123, 'main')
    expect(result).toBe('main')
  })

  it('uses main as default when no defaultBranch provided', () => {
    const result = determineBranchName('qa', 123)
    expect(result).toBe('main')
  })
})

describe('checkForExistingPrUrl', () => {
  it('returns null when no linked PR exists', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    } as any

    const result = await checkForExistingPrUrl(mockSupabase, 'ticket-pk-123')
    expect(result).toBeNull()
  })

  it('returns PR URL when linked PR exists', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [{ pr_url: 'https://github.com/test/repo/pull/1', created_at: '2024-01-01' }],
        error: null,
      }),
    } as any

    const result = await checkForExistingPrUrl(mockSupabase, 'ticket-pk-123')
    expect(result).toBe('https://github.com/test/repo/pull/1')
  })

  it('trims whitespace from PR URL', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [{ pr_url: '  https://github.com/test/repo/pull/1  ', created_at: '2024-01-01' }],
        error: null,
      }),
    } as any

    const result = await checkForExistingPrUrl(mockSupabase, 'ticket-pk-123')
    expect(result).toBe('https://github.com/test/repo/pull/1')
  })

  it('returns null when PR URL is empty string', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [{ pr_url: '', created_at: '2024-01-01' }],
        error: null,
      }),
    } as any

    const result = await checkForExistingPrUrl(mockSupabase, 'ticket-pk-123')
    expect(result).toBeNull()
  })
})

describe('parseAgentType', () => {
  it('returns qa for qa agent type', () => {
    expect(parseAgentType('qa')).toBe('qa')
  })

  it('returns project-manager for project-manager agent type', () => {
    expect(parseAgentType('project-manager')).toBe('project-manager')
  })

  it('returns process-review for process-review agent type', () => {
    expect(parseAgentType('process-review')).toBe('process-review')
  })

  it('returns implementation as default for unknown types', () => {
    expect(parseAgentType('implementation')).toBe('implementation')
    expect(parseAgentType('unknown')).toBe('implementation')
    expect(parseAgentType(null)).toBe('implementation')
    expect(parseAgentType(undefined)).toBe('implementation')
  })
})

describe('validateLaunchInputs', () => {
  it('returns error when repoFullName is missing', () => {
    const result = validateLaunchInputs('', 'implementation', 123, '')
    expect(result).toBe('repoFullName is required.')
  })

  it('returns error when ticketNumber is missing for implementation agent', () => {
    const result = validateLaunchInputs('test/repo', 'implementation', null, '')
    expect(result).toBe('ticketNumber is required.')
  })

  it('returns error when ticketNumber is missing for qa agent', () => {
    const result = validateLaunchInputs('test/repo', 'qa', null, '')
    expect(result).toBe('ticketNumber is required.')
  })

  it('returns error when ticketNumber is missing for process-review agent', () => {
    const result = validateLaunchInputs('test/repo', 'process-review', null, '')
    expect(result).toBe('ticketNumber is required.')
  })

  it('returns error when message is missing for project-manager agent', () => {
    const result = validateLaunchInputs('test/repo', 'project-manager', null, '')
    expect(result).toBe('message is required for project-manager runs.')
  })

  it('returns null when all required inputs are valid for implementation', () => {
    const result = validateLaunchInputs('test/repo', 'implementation', 123, '')
    expect(result).toBeNull()
  })

  it('returns null when all required inputs are valid for qa', () => {
    const result = validateLaunchInputs('test/repo', 'qa', 123, '')
    expect(result).toBeNull()
  })

  it('returns null when all required inputs are valid for project-manager', () => {
    const result = validateLaunchInputs('test/repo', 'project-manager', null, 'test message')
    expect(result).toBeNull()
  })

  it('rejects invalid ticket numbers', () => {
    const result1 = validateLaunchInputs('test/repo', 'implementation', NaN, '')
    expect(result1).toBe('ticketNumber is required.')
    
    const result2 = validateLaunchInputs('test/repo', 'implementation', Infinity, '')
    expect(result2).toBe('ticketNumber is required.')
  })
})

describe('checkForExistingActiveRun', () => {
  it('returns null when no existing run found', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as any

    const result = await checkForExistingActiveRun(mockSupabase, 'test/repo', 123, 'implementation')
    expect(result).toBeNull()
  })

  it('returns existing run data when found', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          run_id: 'run-123',
          status: 'running',
          cursor_agent_id: 'agent-456',
        },
        error: null,
      }),
    } as any

    const result = await checkForExistingActiveRun(mockSupabase, 'test/repo', 123, 'implementation')
    expect(result).toEqual({
      runId: 'run-123',
      status: 'running',
      cursorAgentId: 'agent-456',
    })
  })

  it('handles null cursorAgentId', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          run_id: 'run-123',
          status: 'launching',
          cursor_agent_id: null,
        },
        error: null,
      }),
    } as any

    const result = await checkForExistingActiveRun(mockSupabase, 'test/repo', 123, 'implementation')
    expect(result).toEqual({
      runId: 'run-123',
      status: 'launching',
      cursorAgentId: null,
    })
  })

  it('returns null and logs warning on error', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      }),
    } as any

    const result = await checkForExistingActiveRun(mockSupabase, 'test/repo', 123, 'implementation')
    expect(result).toBeNull()
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error checking for existing run: Database error')
    )

    consoleWarnSpy.mockRestore()
  })
})

describe('moveQATicketToDoing', () => {
  it('returns true when ticket is not in QA column', async () => {
    const mockSupabase = {
      from: vi.fn(),
    } as any

    const result = await moveQATicketToDoing(mockSupabase, 'ticket-pk', 'test/repo', 'HAL-0123', 'col-doing')
    expect(result).toBe(true)
    expect(mockSupabase.from).not.toHaveBeenCalled()
  })

  it('moves ticket from QA to Doing when in QA column', async () => {
    const mockUpdateFinal = vi.fn().mockResolvedValue({ error: null })
    const mockEqFinal = vi.fn().mockReturnValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEqFinal })
    
    const mockLimit = vi.fn().mockResolvedValue({ data: [{ kanban_position: 5 }], error: null })
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit })
    const mockEq2 = vi.fn().mockReturnValue({ order: mockOrder })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq1 })
    
    const mockFrom = vi.fn()
      .mockReturnValueOnce({ select: mockSelect }) // First call for select
      .mockReturnValueOnce({ update: mockUpdate }) // Second call for update

    const mockSupabase = {
      from: mockFrom,
    } as any

    const result = await moveQATicketToDoing(mockSupabase, 'ticket-pk', 'test/repo', 'HAL-0123', 'col-qa')
    expect(result).toBe(true)
    expect(mockFrom).toHaveBeenCalledWith('tickets')
    expect(mockUpdate).toHaveBeenCalled()
  })

  it('handles empty Doing column when moving ticket', async () => {
    const mockUpdateFinal = vi.fn().mockResolvedValue({ error: null })
    const mockEqFinal = vi.fn().mockReturnValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEqFinal })
    
    const mockLimit = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit })
    const mockEq2 = vi.fn().mockReturnValue({ order: mockOrder })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq1 })
    
    const mockFrom = vi.fn()
      .mockReturnValueOnce({ select: mockSelect }) // First call for select
      .mockReturnValueOnce({ update: mockUpdate }) // Second call for update

    const mockSupabase = {
      from: mockFrom,
    } as any

    const result = await moveQATicketToDoing(mockSupabase, 'ticket-pk', 'test/repo', 'HAL-0123', 'col-qa')
    expect(result).toBe(true)
    expect(mockUpdate).toHaveBeenCalled()
  })

  it('returns false and logs error when update fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockEqFinal = vi.fn().mockResolvedValue({ error: { message: 'Update failed' } })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEqFinal })
    
    const mockLimit = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit })
    const mockEq2 = vi.fn().mockReturnValue({ order: mockOrder })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq1 })
    
    const mockFrom = vi.fn()
      .mockReturnValueOnce({ select: mockSelect }) // First call for select
      .mockReturnValueOnce({ update: mockUpdate }) // Second call for update

    const mockSupabase = {
      from: mockFrom,
    } as any

    const result = await moveQATicketToDoing(mockSupabase, 'ticket-pk', 'test/repo', 'HAL-0123', 'col-qa')
    expect(result).toBe(false)
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to move ticket'),
      'Update failed'
    )

    consoleErrorSpy.mockRestore()
  })

  it('handles exceptions gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockSupabase = {
      from: vi.fn().mockImplementation(() => {
        throw new Error('Database connection failed')
      }),
    } as any

    const result = await moveQATicketToDoing(mockSupabase, 'ticket-pk', 'test/repo', 'HAL-0123', 'col-qa')
    expect(result).toBe(false)
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error moving ticket'),
      'Database connection failed'
    )

    consoleErrorSpy.mockRestore()
  })
})
