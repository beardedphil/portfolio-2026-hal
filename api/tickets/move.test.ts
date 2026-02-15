/**
 * Unit tests for ticket movement endpoint (HAL-0614).
 * Tests request validation, column name resolution, and ticket lookup strategies.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'
import handler from './move.js'

// Helper to create mock request
function createMockRequest(body: unknown, method = 'POST'): IncomingMessage {
  const chunks: Uint8Array[] = []
  if (body) {
    chunks.push(Buffer.from(JSON.stringify(body)))
  }
  
  return {
    method,
    [Symbol.asyncIterator]: async function* () {
      for (const chunk of chunks) {
        yield chunk
      }
    },
  } as unknown as IncomingMessage
}

// Helper to create mock response
function createMockResponse(): ServerResponse {
  const headers: Record<string, string> = {}
  let statusCode = 200
  let body: unknown = null
  
  return {
    statusCode: 0,
    setHeader: vi.fn((name: string, value: string) => {
      headers[name] = value
    }),
    get statusCode() {
      return statusCode
    },
    set statusCode(value: number) {
      statusCode = value
    },
    end: vi.fn((data?: string) => {
      if (data) {
        try {
          body = JSON.parse(data)
        } catch {
          body = data
        }
      }
    }),
    get headersSent() {
      return body !== null
    },
    getBody: () => body,
    getHeaders: () => headers,
  } as unknown as ServerResponse
}

// Create a thenable query builder that supports both awaiting and chaining
function createQueryBuilder(resolvedValue: any = { data: null, error: null }) {
  // Create a promise that resolves to the value
  const promise = Promise.resolve(resolvedValue)
  
  // Create a wrapper object that has both promise behavior and chainable methods
  const builder: any = {
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally?.bind(promise),
    eq: vi.fn((column: string, value: any) => {
      // eq() returns a query builder that can be chained further
      const eqBuilder = createQueryBuilder(resolvedValue)
      // Add maybeSingle/single/order methods
      eqBuilder.maybeSingle = vi.fn(() => promise)
      eqBuilder.single = vi.fn(() => promise)
      eqBuilder.order = vi.fn((column: string, options?: any) => {
        return eqBuilder // order() returns the same builder (thenable)
      })
      return eqBuilder
    }),
    order: vi.fn((column: string, options?: any) => {
      // order() can be called on select() result, returns a thenable
      return builder
    }),
  }
  
  return builder
}

// Create mock Supabase client with proper method chaining
function createMockSupabaseClient() {
  const mockClient: any = {
    from: vi.fn((table: string) => {
      const mockTable: any = {
        select: vi.fn((columns: string) => {
          return createQueryBuilder()
        }),
        update: vi.fn((data: any) => {
          const mockUpdate: any = {
            eq: vi.fn((column: string, value: any) => {
              return mockUpdate
            }),
          }
          return mockUpdate
        }),
      }
      return mockTable
    }),
  }
  return mockClient
}

// Mock Supabase client
let mockSupabaseClient: any
vi.mock('@supabase/supabase-js', () => {
  return {
    createClient: vi.fn(() => {
      mockSupabaseClient = createMockSupabaseClient()
      return mockSupabaseClient
    }),
  }
})

describe('api/tickets/move.ts handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient = createMockSupabaseClient()
  })

  describe('Request validation failures', () => {
    it('returns 400 when ticketPk and ticketId are both missing', async () => {
      const req = createMockRequest({
        columnId: 'col-todo',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
      })
      const res = createMockResponse()

      await handler(req, res)

      expect(res.statusCode).toBe(400)
      const body = (res as any).getBody()
      expect(body).toMatchObject({
        success: false,
        error: expect.stringContaining('ticketPk'),
      })
    })

    it('returns 400 when columnId and columnName are both missing', async () => {
      const req = createMockRequest({
        ticketId: '172',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
      })
      const res = createMockResponse()

      await handler(req, res)

      expect(res.statusCode).toBe(400)
      const body = (res as any).getBody()
      expect(body).toMatchObject({
        success: false,
        error: expect.stringContaining('columnId'),
      })
    })

    it('returns 400 when Supabase credentials are missing', async () => {
      const req = createMockRequest({
        ticketId: '172',
        columnId: 'col-todo',
      })
      const res = createMockResponse()

      await handler(req, res)

      expect(res.statusCode).toBe(400)
      const body = (res as any).getBody()
      expect(body).toMatchObject({
        success: false,
        error: expect.stringContaining('Supabase credentials'),
      })
    })
  })

  describe('Column name resolution behavior', () => {
    it('resolves columnName "todo" to To-do column', async () => {
      const mockColumns = [
        { id: 'col-todo', title: 'To-do' },
        { id: 'col-qa', title: 'Ready for QA' },
      ]

      // Setup column fetching mock
      const mockColumnsFrom = mockSupabaseClient.from('kanban_columns')
      const mockColumnsSelect = mockColumnsFrom.select('id, title')
      // Configure select() to return a query builder that resolves to columns
      mockColumnsSelect.mockReturnValue(createQueryBuilder({ data: mockColumns, error: null }))

      // Setup ticket lookup mock
      const mockTicketsFrom = mockSupabaseClient.from('tickets')
      const mockTicketSelect = mockTicketsFrom.select('pk, repo_full_name, kanban_column_id, kanban_position')
      const mockTicketEq = mockTicketSelect.eq('id', '172')
      mockTicketEq.maybeSingle.mockResolvedValue({
        data: { pk: 'ticket-pk-1', repo_full_name: 'test/repo', kanban_column_id: 'col-doing', kanban_position: 0 },
        error: null,
      })

      // Setup tickets in column query mock
      const mockTicketsInColumnSelect = mockTicketsFrom.select('pk, kanban_position')
      const mockTicketsInColumnEq = mockTicketsInColumnSelect.eq('kanban_column_id', 'col-todo')
      mockTicketsInColumnEq.order.mockResolvedValue({
        data: [],
        error: null,
      })

      // Setup update mock
      const mockUpdate = mockTicketsFrom.update({})
      mockUpdate.eq.mockResolvedValue({
        data: null,
        error: null,
      })

      const req = createMockRequest({
        ticketId: '172',
        columnName: 'todo',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
      })
      const res = createMockResponse()

      await handler(req, res)

      expect(res.statusCode).toBe(200)
      const body = (res as any).getBody()
      expect(body).toMatchObject({
        success: true,
        columnId: 'col-todo',
      })
    })

    it('resolves columnName "qa" to a QA column', async () => {
      const mockColumns = [
        { id: 'col-todo', title: 'To-do' },
        { id: 'col-qa', title: 'Ready for QA' },
      ]

      // Setup column fetching mock
      const mockColumnsFrom = mockSupabaseClient.from('kanban_columns')
      const mockColumnsSelect = mockColumnsFrom.select('id, title')
      mockColumnsSelect.mockReturnValue(createQueryBuilder({ data: mockColumns, error: null }))

      // Setup ticket lookup mock
      const mockTicketsFrom = mockSupabaseClient.from('tickets')
      const mockTicketSelect = mockTicketsFrom.select('pk, repo_full_name, kanban_column_id, kanban_position')
      const mockTicketEq = mockTicketSelect.eq('id', '172')
      mockTicketEq.maybeSingle.mockResolvedValue({
        data: { pk: 'ticket-pk-1', repo_full_name: 'test/repo', kanban_column_id: 'col-doing', kanban_position: 0 },
        error: null,
      })

      // Setup artifacts check mock (required for col-qa)
      const mockArtifactsSelect = mockTicketsFrom.select('title, agent_type, body_md')
      const mockArtifactsEq = mockArtifactsSelect.eq('ticket_pk', 'ticket-pk-1')
      mockArtifactsEq.mockResolvedValue({
        data: [
          { title: 'Plan for ticket 172', agent_type: 'implementation', body_md: 'test' },
          { title: 'Worklog for ticket 172', agent_type: 'implementation', body_md: 'test' },
          { title: 'Changed Files for ticket 172', agent_type: 'implementation', body_md: 'test' },
          { title: 'Decisions for ticket 172', agent_type: 'implementation', body_md: 'test' },
          { title: 'Verification for ticket 172', agent_type: 'implementation', body_md: 'test' },
          { title: 'PM Review for ticket 172', agent_type: 'implementation', body_md: 'test' },
          { title: 'Git diff for ticket 172', agent_type: 'implementation', body_md: 'test' },
          { title: 'Instructions Used for ticket 172', agent_type: 'implementation', body_md: 'test' },
        ],
        error: null,
      })

      // Setup tickets in column query mock
      const mockTicketsInColumnSelect = mockTicketsFrom.select('pk, kanban_position')
      const mockTicketsInColumnEq = mockTicketsInColumnSelect.eq('kanban_column_id', 'col-qa')
      mockTicketsInColumnEq.order.mockResolvedValue({
        data: [],
        error: null,
      })

      // Setup update mock
      const mockUpdate = mockTicketsFrom.update({})
      mockUpdate.eq.mockResolvedValue({
        data: null,
        error: null,
      })

      const req = createMockRequest({
        ticketId: '172',
        columnName: 'qa',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
      })
      const res = createMockResponse()

      await handler(req, res)

      expect(res.statusCode).toBe(200)
      const body = (res as any).getBody()
      expect(body).toMatchObject({
        success: true,
        columnId: 'col-qa',
      })
    })

    it('returns success: false with helpful error for unknown column name', async () => {
      const mockColumns = [
        { id: 'col-todo', title: 'To-do' },
        { id: 'col-qa', title: 'Ready for QA' },
      ]

      // Setup column fetching mock
      const mockColumnsFrom = mockSupabaseClient.from('kanban_columns')
      const mockColumnsSelect = mockColumnsFrom.select('id, title')
      mockColumnsSelect.mockReturnValue(createQueryBuilder({ data: mockColumns, error: null }))

      const req = createMockRequest({
        ticketId: '172',
        columnName: 'nonexistent-column',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
      })
      const res = createMockResponse()

      await handler(req, res)

      expect(res.statusCode).toBe(200)
      const body = (res as any).getBody()
      expect(body).toMatchObject({
        success: false,
        error: expect.stringContaining('not found'),
      })
      expect(body.error).toContain('Available columns')
    })
  })

  describe('Ticket lookup strategies', () => {
    beforeEach(() => {
      // Setup mock for column fetching
      const mockColumnsFrom = mockSupabaseClient.from('kanban_columns')
      const mockColumnsSelect = mockColumnsFrom.select('id, title')
      mockColumnsSelect.mockResolvedValue({
        data: [{ id: 'col-todo', title: 'To-do' }],
        error: null,
      })

      // Setup mock for tickets in column
      const mockTicketsFrom = mockSupabaseClient.from('tickets')
      const mockTicketsSelect = mockTicketsFrom.select('pk, kanban_position')
      const mockTicketsEq = mockTicketsSelect.eq('kanban_column_id', 'col-todo')
      mockTicketsEq.order.mockResolvedValue({
        data: [],
        error: null,
      })

      // Setup mock for update
      const mockUpdate = mockTicketsFrom.update({})
      mockUpdate.eq.mockResolvedValue({
        data: null,
        error: null,
      })
    })

    it('looks up ticket by ticketPk', async () => {
      const mockTicketsFrom = mockSupabaseClient.from('tickets')
      const mockTicketSelect = mockTicketsFrom.select('pk, repo_full_name, kanban_column_id, kanban_position')
      const mockTicketEq = mockTicketSelect.eq('pk', 'ticket-pk-1')
      mockTicketEq.maybeSingle.mockResolvedValue({
        data: { pk: 'ticket-pk-1', repo_full_name: 'test/repo', kanban_column_id: 'col-doing', kanban_position: 0 },
        error: null,
      })

      const req = createMockRequest({
        ticketPk: 'ticket-pk-1',
        columnId: 'col-todo',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
      })
      const res = createMockResponse()

      await handler(req, res)

      expect(res.statusCode).toBe(200)
      const body = (res as any).getBody()
      expect(body).toMatchObject({
        success: true,
      })
      expect(mockTicketEq.maybeSingle).toHaveBeenCalled()
    })

    it('looks up ticket by numeric id', async () => {
      const mockTicketsFrom = mockSupabaseClient.from('tickets')
      const mockTicketSelect = mockTicketsFrom.select('pk, repo_full_name, kanban_column_id, kanban_position')
      const mockTicketEq = mockTicketSelect.eq('id', '172')
      mockTicketEq.maybeSingle.mockResolvedValue({
        data: { pk: 'ticket-pk-1', repo_full_name: 'test/repo', kanban_column_id: 'col-doing', kanban_position: 0 },
        error: null,
      })

      const req = createMockRequest({
        ticketId: '172',
        columnId: 'col-todo',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
      })
      const res = createMockResponse()

      await handler(req, res)

      expect(res.statusCode).toBe(200)
      const body = (res as any).getBody()
      expect(body).toMatchObject({
        success: true,
      })
      expect(mockTicketEq.maybeSingle).toHaveBeenCalled()
    })

    it('looks up ticket by display_id (e.g., HAL-0172)', async () => {
      const mockTicketsFrom = mockSupabaseClient.from('tickets')
      const mockTicketSelect = mockTicketsFrom.select('pk, repo_full_name, kanban_column_id, kanban_position')
      
      // First attempt by id fails
      const mockTicketEqById = mockTicketSelect.eq('id', 'HAL-0172')
      mockTicketEqById.maybeSingle.mockResolvedValue({
        data: null,
        error: null,
      })

      // Second attempt by display_id succeeds
      const mockTicketEqByDisplayId = mockTicketSelect.eq('display_id', 'HAL-0172')
      mockTicketEqByDisplayId.maybeSingle.mockResolvedValue({
        data: { pk: 'ticket-pk-1', repo_full_name: 'test/repo', kanban_column_id: 'col-doing', kanban_position: 0 },
        error: null,
      })

      const req = createMockRequest({
        ticketId: 'HAL-0172',
        columnId: 'col-todo',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
      })
      const res = createMockResponse()

      await handler(req, res)

      expect(res.statusCode).toBe(200)
      const body = (res as any).getBody()
      expect(body).toMatchObject({
        success: true,
      })
    })

    it('looks up ticket by leading-zero numeric id (e.g., 0172)', async () => {
      const mockTicketsFrom = mockSupabaseClient.from('tickets')
      const mockTicketSelect = mockTicketsFrom.select('pk, repo_full_name, kanban_column_id, kanban_position')
      
      // First attempt by id with leading zeros fails
      const mockTicketEqById = mockTicketSelect.eq('id', '0172')
      mockTicketEqById.maybeSingle.mockResolvedValue({
        data: null,
        error: null,
      })

      // Second attempt by display_id fails
      const mockTicketEqByDisplayId = mockTicketSelect.eq('display_id', '0172')
      mockTicketEqByDisplayId.maybeSingle.mockResolvedValue({
        data: null,
        error: null,
      })

      // Third attempt by id without leading zeros succeeds
      const mockTicketEqByIdNoZeros = mockTicketSelect.eq('id', '172')
      mockTicketEqByIdNoZeros.maybeSingle.mockResolvedValue({
        data: { pk: 'ticket-pk-1', repo_full_name: 'test/repo', kanban_column_id: 'col-doing', kanban_position: 0 },
        error: null,
      })

      const req = createMockRequest({
        ticketId: '0172',
        columnId: 'col-todo',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
      })
      const res = createMockResponse()

      await handler(req, res)

      expect(res.statusCode).toBe(200)
      const body = (res as any).getBody()
      expect(body).toMatchObject({
        success: true,
      })
    })

    it('returns success: false when ticket is not found', async () => {
      const mockTicketsFrom = mockSupabaseClient.from('tickets')
      const mockTicketSelect = mockTicketsFrom.select('pk, repo_full_name, kanban_column_id, kanban_position')
      const mockTicketEq = mockTicketSelect.eq('id', '999')
      mockTicketEq.maybeSingle.mockResolvedValue({
        data: null,
        error: null,
      })

      // Also mock display_id lookup
      const mockTicketEqByDisplayId = mockTicketSelect.eq('display_id', '999')
      mockTicketEqByDisplayId.maybeSingle.mockResolvedValue({
        data: null,
        error: null,
      })

      const req = createMockRequest({
        ticketId: '999',
        columnId: 'col-todo',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
      })
      const res = createMockResponse()

      await handler(req, res)

      expect(res.statusCode).toBe(200)
      const body = (res as any).getBody()
      expect(body).toMatchObject({
        success: false,
        error: expect.stringContaining('not found'),
      })
    })
  })
})
