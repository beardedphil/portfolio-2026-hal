import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseTicketBodySections,
  buildImplementationPrompt,
  buildQAPrompt,
  determineBranchName,
  checkForExistingPrUrl,
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
