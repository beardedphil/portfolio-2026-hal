import { describe, it, expect } from 'vitest'
import {
  TERMINAL_RUN_STATUSES,
  isNonTerminalRunStatus,
  toTimeMs,
  pickMoreRelevantRun,
  buildAgentRunsByTicketPk,
} from './agentRunSelection'
import type { KanbanAgentRunRow } from 'portfolio-2026-kanban'

describe('agentRunSelection', () => {
  describe('TERMINAL_RUN_STATUSES', () => {
    it('should contain expected terminal statuses', () => {
      expect(TERMINAL_RUN_STATUSES.has('finished')).toBe(true)
      expect(TERMINAL_RUN_STATUSES.has('completed')).toBe(true)
      expect(TERMINAL_RUN_STATUSES.has('failed')).toBe(true)
    })

    it('should be case-sensitive', () => {
      expect(TERMINAL_RUN_STATUSES.has('Finished')).toBe(false)
      expect(TERMINAL_RUN_STATUSES.has('COMPLETED')).toBe(false)
    })
  })

  describe('isNonTerminalRunStatus', () => {
    it('should return false for terminal statuses', () => {
      expect(isNonTerminalRunStatus('finished')).toBe(false)
      expect(isNonTerminalRunStatus('completed')).toBe(false)
      expect(isNonTerminalRunStatus('failed')).toBe(false)
    })

    it('should return true for non-terminal statuses', () => {
      expect(isNonTerminalRunStatus('running')).toBe(true)
      expect(isNonTerminalRunStatus('polling')).toBe(true)
      expect(isNonTerminalRunStatus('preparing')).toBe(true)
      expect(isNonTerminalRunStatus('launching')).toBe(true)
    })

    it('should handle case-insensitive matching', () => {
      expect(isNonTerminalRunStatus('FINISHED')).toBe(false)
      expect(isNonTerminalRunStatus('Finished')).toBe(false)
      expect(isNonTerminalRunStatus('RUNNING')).toBe(true)
      expect(isNonTerminalRunStatus('Running')).toBe(true)
    })

    it('should handle null and undefined', () => {
      expect(isNonTerminalRunStatus(null)).toBe(false)
      expect(isNonTerminalRunStatus(undefined)).toBe(false)
    })

    it('should handle empty strings', () => {
      expect(isNonTerminalRunStatus('')).toBe(false)
      expect(isNonTerminalRunStatus('   ')).toBe(false)
    })

    it('should trim whitespace', () => {
      expect(isNonTerminalRunStatus('  finished  ')).toBe(false)
      expect(isNonTerminalRunStatus('  running  ')).toBe(true)
    })
  })

  describe('toTimeMs', () => {
    it('should convert valid ISO date string to milliseconds', () => {
      const iso = '2024-01-15T14:30:45.123Z'
      const result = toTimeMs(iso)
      expect(result).toBe(new Date(iso).getTime())
      expect(result).toBeGreaterThan(0)
    })

    it('should return 0 for null', () => {
      expect(toTimeMs(null)).toBe(0)
    })

    it('should return 0 for undefined', () => {
      expect(toTimeMs(undefined)).toBe(0)
    })

    it('should return 0 for empty string', () => {
      expect(toTimeMs('')).toBe(0)
    })

    it('should return 0 for invalid date string', () => {
      expect(toTimeMs('not-a-date')).toBe(0)
    })

    it('should handle dates without timezone', () => {
      const iso = '2024-01-15T14:30:45'
      const result = toTimeMs(iso)
      expect(result).toBe(new Date(iso).getTime())
    })

    it('should handle dates with milliseconds', () => {
      const iso = '2024-01-15T14:30:45.789Z'
      const result = toTimeMs(iso)
      expect(result).toBe(new Date(iso).getTime())
    })
  })

  describe('pickMoreRelevantRun', () => {
    const createRun = (
      status: string,
      created_at: string,
      updated_at: string,
      ticket_pk: string = 'ticket-1'
    ): KanbanAgentRunRow => {
      return {
        status,
        created_at,
        updated_at,
        ticket_pk,
      } as KanbanAgentRunRow
    }

    it('should return b when a is undefined', () => {
      const b = createRun('running', '2024-01-15T10:00:00Z', '2024-01-15T10:00:00Z')
      expect(pickMoreRelevantRun(undefined, b)).toBe(b)
    })

    it('should return a when b is undefined', () => {
      const a = createRun('running', '2024-01-15T10:00:00Z', '2024-01-15T10:00:00Z')
      expect(pickMoreRelevantRun(a, undefined)).toBe(a)
    })

    it('should return undefined when both are undefined', () => {
      expect(pickMoreRelevantRun(undefined, undefined)).toBeUndefined()
    })

    it('should prefer non-terminal run over terminal run', () => {
      const terminal = createRun('completed', '2024-01-15T10:00:00Z', '2024-01-15T10:00:00Z')
      const nonTerminal = createRun('running', '2024-01-15T09:00:00Z', '2024-01-15T09:00:00Z')
      expect(pickMoreRelevantRun(terminal, nonTerminal)).toBe(nonTerminal)
      expect(pickMoreRelevantRun(nonTerminal, terminal)).toBe(nonTerminal)
    })

    it('should prefer more recently created run when both are terminal', () => {
      const older = createRun('completed', '2024-01-15T10:00:00Z', '2024-01-15T10:00:00Z')
      const newer = createRun('failed', '2024-01-15T11:00:00Z', '2024-01-15T11:00:00Z')
      expect(pickMoreRelevantRun(older, newer)).toBe(newer)
      expect(pickMoreRelevantRun(newer, older)).toBe(newer)
    })

    it('should prefer more recently created run when both are non-terminal', () => {
      const older = createRun('running', '2024-01-15T10:00:00Z', '2024-01-15T10:00:00Z')
      const newer = createRun('polling', '2024-01-15T11:00:00Z', '2024-01-15T11:00:00Z')
      expect(pickMoreRelevantRun(older, newer)).toBe(newer)
      expect(pickMoreRelevantRun(newer, older)).toBe(newer)
    })

    it('should prefer more recently updated run when created_at is equal', () => {
      const older = createRun('running', '2024-01-15T10:00:00Z', '2024-01-15T10:00:00Z')
      const newer = createRun('running', '2024-01-15T10:00:00Z', '2024-01-15T11:00:00Z')
      expect(pickMoreRelevantRun(older, newer)).toBe(newer)
      expect(pickMoreRelevantRun(newer, older)).toBe(newer)
    })

    it('should return a (stable tie-breaker) when runs are identical', () => {
      const a = createRun('running', '2024-01-15T10:00:00Z', '2024-01-15T10:00:00Z')
      const b = createRun('running', '2024-01-15T10:00:00Z', '2024-01-15T10:00:00Z')
      expect(pickMoreRelevantRun(a, b)).toBe(a)
    })

    it('should handle null status values', () => {
      const a = createRun('running', '2024-01-15T10:00:00Z', '2024-01-15T10:00:00Z')
      const b = { ...createRun('running', '2024-01-15T11:00:00Z', '2024-01-15T11:00:00Z'), status: null } as any
      // b has null status, which is treated as terminal, so a (non-terminal) should be preferred
      expect(pickMoreRelevantRun(a, b)).toBe(a)
    })

    it('should handle invalid date strings', () => {
      const a = createRun('running', '2024-01-15T10:00:00Z', '2024-01-15T10:00:00Z')
      const b = createRun('running', 'invalid-date', 'invalid-date')
      // Both have same status, but b has invalid dates (treated as 0), so a should be preferred
      expect(pickMoreRelevantRun(a, b)).toBe(a)
    })
  })

  describe('buildAgentRunsByTicketPk', () => {
    const createRun = (
      ticket_pk: string,
      status: string,
      created_at: string,
      updated_at: string
    ): KanbanAgentRunRow => {
      return {
        ticket_pk,
        status,
        created_at,
        updated_at,
      } as KanbanAgentRunRow
    }

    it('should return empty object for empty array', () => {
      expect(buildAgentRunsByTicketPk([])).toEqual({})
    })

    it('should build map with single run', () => {
      const run = createRun('ticket-1', 'running', '2024-01-15T10:00:00Z', '2024-01-15T10:00:00Z')
      const result = buildAgentRunsByTicketPk([run])
      expect(result).toEqual({ 'ticket-1': run })
    })

    it('should build map with multiple runs for different tickets', () => {
      const run1 = createRun('ticket-1', 'running', '2024-01-15T10:00:00Z', '2024-01-15T10:00:00Z')
      const run2 = createRun('ticket-2', 'completed', '2024-01-15T11:00:00Z', '2024-01-15T11:00:00Z')
      const result = buildAgentRunsByTicketPk([run1, run2])
      expect(result).toEqual({
        'ticket-1': run1,
        'ticket-2': run2,
      })
    })

    it('should select most relevant run when multiple runs exist for same ticket', () => {
      const terminal = createRun('ticket-1', 'completed', '2024-01-15T10:00:00Z', '2024-01-15T10:00:00Z')
      const nonTerminal = createRun('ticket-1', 'running', '2024-01-15T09:00:00Z', '2024-01-15T09:00:00Z')
      const result = buildAgentRunsByTicketPk([terminal, nonTerminal])
      expect(result).toEqual({ 'ticket-1': nonTerminal })
    })

    it('should select most recent run when multiple terminal runs exist for same ticket', () => {
      const older = createRun('ticket-1', 'completed', '2024-01-15T10:00:00Z', '2024-01-15T10:00:00Z')
      const newer = createRun('ticket-1', 'failed', '2024-01-15T11:00:00Z', '2024-01-15T11:00:00Z')
      const result = buildAgentRunsByTicketPk([older, newer])
      expect(result).toEqual({ 'ticket-1': newer })
    })

    it('should ignore runs with null or undefined ticket_pk', () => {
      const run1 = createRun('ticket-1', 'running', '2024-01-15T10:00:00Z', '2024-01-15T10:00:00Z')
      const run2 = { ...createRun('ticket-2', 'running', '2024-01-15T11:00:00Z', '2024-01-15T11:00:00Z'), ticket_pk: null } as any
      const run3 = { ...createRun('ticket-3', 'running', '2024-01-15T12:00:00Z', '2024-01-15T12:00:00Z'), ticket_pk: undefined } as any
      const result = buildAgentRunsByTicketPk([run1, run2, run3])
      expect(result).toEqual({ 'ticket-1': run1 })
    })

    it('should handle complex scenario with multiple tickets and multiple runs', () => {
      const ticket1Terminal = createRun('ticket-1', 'completed', '2024-01-15T10:00:00Z', '2024-01-15T10:00:00Z')
      const ticket1NonTerminal = createRun('ticket-1', 'running', '2024-01-15T11:00:00Z', '2024-01-15T11:00:00Z')
      const ticket2Older = createRun('ticket-2', 'failed', '2024-01-15T09:00:00Z', '2024-01-15T09:00:00Z')
      const ticket2Newer = createRun('ticket-2', 'completed', '2024-01-15T12:00:00Z', '2024-01-15T12:00:00Z')
      const ticket3 = createRun('ticket-3', 'polling', '2024-01-15T13:00:00Z', '2024-01-15T13:00:00Z')

      const result = buildAgentRunsByTicketPk([
        ticket1Terminal,
        ticket1NonTerminal,
        ticket2Older,
        ticket2Newer,
        ticket3,
      ])

      expect(result).toEqual({
        'ticket-1': ticket1NonTerminal, // Non-terminal preferred
        'ticket-2': ticket2Newer, // More recent terminal run
        'ticket-3': ticket3, // Only run for this ticket
      })
    })
  })
})
