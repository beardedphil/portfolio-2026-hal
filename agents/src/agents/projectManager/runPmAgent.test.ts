import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  isUnknownColumnError,
  isUniqueViolation,
  autoFixTicketBody,
  computeNextTodoPosition,
} from './runPmAgent.js'
import type { SupabaseClient } from '@supabase/supabase-js'

describe('isUnknownColumnError', () => {
  it('returns true for Postgres error code 42703', () => {
    const err = { code: '42703', message: 'Some error' }
    expect(isUnknownColumnError(err)).toBe(true)
  })

  it('returns true when message contains "column" and "does not exist"', () => {
    const err = { message: 'Column "xyz" does not exist' }
    expect(isUnknownColumnError(err)).toBe(true)
  })

  it('returns true when message contains "column" and "does not exist" (case insensitive)', () => {
    const err = { message: 'COLUMN "xyz" DOES NOT EXIST' }
    expect(isUnknownColumnError(err)).toBe(true)
  })

  it('returns false when message contains "column" but not "does not exist"', () => {
    const err = { message: 'Column "xyz" is invalid' }
    expect(isUnknownColumnError(err)).toBe(false)
  })

  it('returns false when message contains "does not exist" but not "column"', () => {
    const err = { message: 'Table "xyz" does not exist' }
    expect(isUnknownColumnError(err)).toBe(false)
  })

  it('returns false for other error codes', () => {
    const err = { code: '23505', message: 'Duplicate key' }
    expect(isUnknownColumnError(err)).toBe(false)
  })

  it('returns false for null/undefined error', () => {
    expect(isUnknownColumnError(null)).toBe(false)
    expect(isUnknownColumnError(undefined)).toBe(false)
  })

  it('returns false for error without code or message', () => {
    const err = {}
    expect(isUnknownColumnError(err)).toBe(false)
  })
})

describe('isUniqueViolation', () => {
  it('returns true for Postgres error code 23505', () => {
    const err = { code: '23505', message: 'Some error' }
    expect(isUniqueViolation(err)).toBe(true)
  })

  it('returns true when message contains "duplicate key"', () => {
    const err = { message: 'duplicate key value violates unique constraint' }
    expect(isUniqueViolation(err)).toBe(true)
  })

  it('returns true when message contains "unique constraint"', () => {
    const err = { message: 'violates unique constraint "tickets_id_key"' }
    expect(isUniqueViolation(err)).toBe(true)
  })

  it('returns true when message contains "duplicate key" (case insensitive)', () => {
    const err = { message: 'DUPLICATE KEY value violates' }
    expect(isUniqueViolation(err)).toBe(true)
  })

  it('returns false for null error', () => {
    expect(isUniqueViolation(null)).toBe(false)
  })

  it('returns false for error without matching code or message', () => {
    const err = { code: '42703', message: 'Column does not exist' }
    expect(isUniqueViolation(err)).toBe(false)
  })

  it('returns false for empty error object', () => {
    const err = {}
    expect(isUniqueViolation(err)).toBe(false)
  })
})

describe('autoFixTicketBody', () => {
  it('converts bullets to checkboxes in Acceptance criteria section', () => {
    const bodyMd = `## Goal (one sentence)

Some goal.

## Acceptance criteria (UI-only)

- Item 1
- Item 2
* Item 3
+ Item 4

## Constraints

None.`

    const result = autoFixTicketBody(bodyMd)
    expect(result.autoFixed).toBe(true)
    expect(result.fixedBody).toContain('- [ ] Item 1')
    expect(result.fixedBody).toContain('- [ ] Item 2')
    expect(result.fixedBody).toContain('- [ ] Item 3')
    expect(result.fixedBody).toContain('- [ ] Item 4')
  })

  it('converts bullets to checkboxes preserving relative indentation', () => {
    const bodyMd = `## Acceptance criteria (UI-only)

  - Indented item 1
    - Nested item
  * Indented item 2

## Constraints

None.`

    const result = autoFixTicketBody(bodyMd)
    expect(result.autoFixed).toBe(true)
    // The function converts bullets to checkboxes
    // Note: sectionContent trims leading whitespace, but relative indentation within items is preserved
    expect(result.fixedBody).toContain('- [ ] Indented item 1')
    expect(result.fixedBody).toContain('- [ ] Nested item')
    expect(result.fixedBody).toContain('- [ ] Indented item 2')
    // Verify bullets were converted (no plain bullets remain in AC section)
    const acMatch = result.fixedBody.match(/## Acceptance criteria \(UI-only\)\s*\n([\s\S]*?)(?=\n##|$)/)
    if (acMatch) {
      const acContent = acMatch[1]
      // Check that there are no plain bullets (without [ ] checkbox pattern)
      const plainBulletRegex = /^[\s]*[-*+]\s+(?!\[)/m
      expect(acContent).not.toMatch(plainBulletRegex) // No plain bullets
      expect(acContent).toMatch(/- \[ \]/) // Has checkboxes
    }
  })

  it('does not modify body when Acceptance criteria already has checkboxes', () => {
    const bodyMd = `## Acceptance criteria (UI-only)

- [ ] Item 1
- [ ] Item 2

## Constraints

None.`

    const result = autoFixTicketBody(bodyMd)
    expect(result.autoFixed).toBe(false)
    expect(result.fixedBody).toBe(bodyMd)
  })

  it('does not modify body when Acceptance criteria section does not exist', () => {
    const bodyMd = `## Goal (one sentence)

Some goal.

## Constraints

None.`

    const result = autoFixTicketBody(bodyMd)
    expect(result.autoFixed).toBe(false)
    expect(result.fixedBody).toBe(bodyMd)
  })

  it('does not modify body when Acceptance criteria has no bullets', () => {
    const bodyMd = `## Acceptance criteria (UI-only)

Some text without bullets.

## Constraints

None.`

    const result = autoFixTicketBody(bodyMd)
    expect(result.autoFixed).toBe(false)
    expect(result.fixedBody).toBe(bodyMd)
  })

  it('handles empty Acceptance criteria section', () => {
    const bodyMd = `## Acceptance criteria (UI-only)

## Constraints

None.`

    const result = autoFixTicketBody(bodyMd)
    expect(result.autoFixed).toBe(false)
    expect(result.fixedBody).toBe(bodyMd)
  })

  it('only modifies Acceptance criteria section, preserves other sections', () => {
    const bodyMd = `## Goal (one sentence)

Some goal.

## Acceptance criteria (UI-only)

- Item 1
- Item 2

## Constraints

- Constraint 1
- Constraint 2

## Non-goals

- Non-goal 1`

    const result = autoFixTicketBody(bodyMd)
    expect(result.autoFixed).toBe(true)
    // Acceptance criteria should be fixed
    expect(result.fixedBody).toContain('- [ ] Item 1')
    expect(result.fixedBody).toContain('- [ ] Item 2')
    // Other sections should remain unchanged
    expect(result.fixedBody).toContain('- Constraint 1')
    expect(result.fixedBody).toContain('- Constraint 2')
    expect(result.fixedBody).toContain('- Non-goal 1')
  })

  it('handles Acceptance criteria as the last section', () => {
    const bodyMd = `## Goal (one sentence)

Some goal.

## Acceptance criteria (UI-only)

- Item 1
- Item 2`

    const result = autoFixTicketBody(bodyMd)
    expect(result.autoFixed).toBe(true)
    expect(result.fixedBody).toContain('- [ ] Item 1')
    expect(result.fixedBody).toContain('- [ ] Item 2')
  })
})

describe('computeNextTodoPosition', () => {
  let mockSupabase: SupabaseClient
  let mockFrom: any
  let mockSelect: any
  let mockEq: any
  let mockOrder: any
  let mockLimit: any

  beforeEach(() => {
    mockLimit = vi.fn()
    mockOrder = vi.fn().mockReturnValue({ limit: mockLimit })
    const mockEq2 = vi.fn().mockReturnValue({ order: mockOrder })
    mockEq = vi.fn().mockReturnValue({ eq: mockEq2, order: mockOrder })
    mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    mockFrom = vi.fn().mockReturnValue({ select: mockSelect })
    mockSupabase = { from: mockFrom } as any
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('computes next position from existing tickets in repo-scoped mode', async () => {
    const mockData = [{ kanban_position: 5 }, { kanban_position: 3 }]
    mockLimit.mockResolvedValue({ data: mockData, error: null })

    const result = await computeNextTodoPosition(mockSupabase, 'owner/repo')
    
    expect('position' in result).toBe(true)
    if ('position' in result) {
      expect(result.position).toBe(6) // max(5, 3) + 1
    }
    expect(mockFrom).toHaveBeenCalledWith('tickets')
    expect(mockSelect).toHaveBeenCalledWith('kanban_position')
    expect(mockEq).toHaveBeenCalledWith('kanban_column_id', 'col-todo')
  })

  it('computes next position from existing tickets in legacy mode', async () => {
    const mockData = [{ kanban_position: 2 }]
    mockLimit.mockResolvedValue({ data: mockData, error: null })

    const result = await computeNextTodoPosition(mockSupabase, 'legacy/unknown')
    
    expect('position' in result).toBe(true)
    if ('position' in result) {
      expect(result.position).toBe(3) // max(2) + 1
    }
    expect(mockEq).not.toHaveBeenCalledWith('repo_full_name', expect.anything())
  })

  it('returns position 1 when no tickets exist in To Do', async () => {
    mockLimit.mockResolvedValue({ data: [], error: null })

    const result = await computeNextTodoPosition(mockSupabase, 'owner/repo')
    
    expect('position' in result).toBe(true)
    if ('position' in result) {
      expect(result.position).toBe(1) // 0 + 1
    }
  })

  it('handles unknown column error with legacy fallback', async () => {
    const unknownColumnError = { code: '42703', message: 'column does not exist' }
    mockLimit.mockResolvedValueOnce({ data: null, error: unknownColumnError })
    
    const legacyData = [{ kanban_position: 4 }]
    const legacyMockLimit = vi.fn().mockResolvedValue({ data: legacyData, error: null })
    const legacyMockOrder = vi.fn().mockReturnValue({ limit: legacyMockLimit })
    const legacyMockEq = vi.fn().mockReturnValue({ order: legacyMockOrder })
    const legacyMockSelect = vi.fn().mockReturnValue({ eq: legacyMockEq })
    mockFrom.mockReturnValueOnce({ select: mockSelect }).mockReturnValueOnce({ select: legacyMockSelect })

    const result = await computeNextTodoPosition(mockSupabase, 'owner/repo')
    
    expect('position' in result).toBe(true)
    if ('position' in result) {
      expect(result.position).toBe(5) // max(4) + 1
    }
  })

  it('returns error when fetch fails with non-column error', async () => {
    const fetchError = { code: 'PGRST116', message: 'Not found' }
    mockLimit.mockResolvedValue({ data: null, error: fetchError })

    const result = await computeNextTodoPosition(mockSupabase, 'owner/repo')
    
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('Failed to fetch To Do position')
    }
  })

  it('returns error when legacy fallback also fails', async () => {
    const unknownColumnError = { code: '42703', message: 'column does not exist' }
    mockLimit.mockResolvedValueOnce({ data: null, error: unknownColumnError })
    
    const legacyError = { code: 'PGRST116', message: 'Not found' }
    const legacyMockLimit = vi.fn().mockResolvedValue({ data: null, error: legacyError })
    const legacyMockOrder = vi.fn().mockReturnValue({ limit: legacyMockLimit })
    const legacyMockEq = vi.fn().mockReturnValue({ order: legacyMockOrder })
    const legacyMockSelect = vi.fn().mockReturnValue({ eq: legacyMockEq })
    mockFrom.mockReturnValueOnce({ select: mockSelect }).mockReturnValueOnce({ select: legacyMockSelect })

    const result = await computeNextTodoPosition(mockSupabase, 'owner/repo')
    
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('Failed to fetch To Do position')
    }
  })

  it('handles tickets with missing kanban_position', async () => {
    const mockData = [{ kanban_position: 5 }, {}, { kanban_position: undefined }]
    mockLimit.mockResolvedValue({ data: mockData, error: null })

    const result = await computeNextTodoPosition(mockSupabase, 'owner/repo')
    
    expect('position' in result).toBe(true)
    if ('position' in result) {
      expect(result.position).toBe(6) // max(5, 0, 0) + 1
    }
  })
})
