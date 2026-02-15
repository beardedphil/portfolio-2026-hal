/**
 * Unit tests for api/tickets/move.ts handler.
 * Tests request validation, column name resolution, and ticket lookup strategies.
 */

import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'
import handler from './move.js'

// Mock Supabase client
vi.mock('@supabase/supabase-js', () => {
  return {
    createClient: vi.fn(),
  }
})

// Helper to create a chainable query builder that is also thenable
function createQueryBuilder(result: { data: any; error: any }) {
  const promise = Promise.resolve(result)
  const builder: any = Object.assign(promise, {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    single: vi.fn(() => Promise.resolve(result)),
    order: vi.fn(() => Promise.resolve(result)),
    update: vi.fn(() => builder),
  })
  return builder
}

// Helper to create a mock Supabase client with configurable query results
function createMockSupabaseClient(config: {
  columnsResult?: { data: any; error: any }
  ticketResult?: { data: any; error: any } | ((field: string, value: any) => { data: any; error: any })
  ticketsInColumnResult?: { data: any; error: any }
  updateResult?: { data: any; error: any }
  artifactsResult?: { data: any; error: any }
}) {
  const mockClient: any = {
    from: vi.fn((table: string) => {
      if (table === 'kanban_columns') {
        return createQueryBuilder(config.columnsResult || { data: [], error: null })
      }
      if (table === 'tickets') {
        // Track the last eq() call to determine which result to return
        let lastEqField: string | null = null
        let lastEqValue: any = null
        
        const promise = Promise.resolve(config.ticketsInColumnResult || { data: [], error: null })
        const builder: any = Object.assign(promise, {
          select: vi.fn(() => builder),
          eq: vi.fn((field: string, value: any) => {
            lastEqField = field
            lastEqValue = value
            
            if (field === 'kanban_column_id') {
              // Query for tickets in column - return a builder that supports chaining eq() calls
              const columnPromise = Promise.resolve(config.ticketsInColumnResult || { data: [], error: null })
              const columnBuilder: any = Object.assign(columnPromise, {
                eq: vi.fn(() => columnBuilder), // Chainable - can call eq() multiple times
                order: vi.fn(() => Promise.resolve(config.ticketsInColumnResult || { data: [], error: null })),
              })
              return columnBuilder
            }
            
            // For ticket lookup queries, eq() returns the builder itself (for chaining)
            return builder
          }),
          maybeSingle: vi.fn(() => {
            // When maybeSingle is called, use the last eq() call to determine result
            const ticketResult = typeof config.ticketResult === 'function'
              ? config.ticketResult(lastEqField || '', lastEqValue)
              : (config.ticketResult || { data: null, error: null })
            return Promise.resolve(ticketResult)
          }),
          single: vi.fn(() => {
            const ticketResult = typeof config.ticketResult === 'function'
              ? config.ticketResult(lastEqField || '', lastEqValue)
              : (config.ticketResult || { data: null, error: null })
            return Promise.resolve(ticketResult)
          }),
          update: vi.fn(() => {
            const updatePromise = Promise.resolve(config.updateResult || { data: {}, error: null })
            const updateBuilder: any = Object.assign(updatePromise, {
              eq: vi.fn(() => Promise.resolve(config.updateResult || { data: {}, error: null })),
            })
            return updateBuilder
          }),
          order: vi.fn(() => Promise.resolve(config.ticketsInColumnResult || { data: [], error: null })),
        })
        return builder
      }
      if (table === 'agent_artifacts') {
        return createQueryBuilder(config.artifactsResult || { data: [], error: null })
      }
      return createQueryBuilder({ data: null, error: null })
    }),
  }
  return mockClient
}

// Helper to create mock request/response
function createMockRequest(body: any): IncomingMessage {
  const chunks: Buffer[] = []
  if (body) {
    chunks.push(Buffer.from(JSON.stringify(body)))
  }
  let chunkIndex = 0
  return {
    method: 'POST',
    [Symbol.asyncIterator]: async function* () {
      for (const chunk of chunks) {
        yield chunk
      }
    },
  } as any
}

function createMockResponse(): ServerResponse {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    setHeader: vi.fn((name: string, value: string) => {
      res.headers[name.toLowerCase()] = value
    }),
    end: vi.fn((body?: any) => {
      res.body = body
      res.headersSent = true
    }),
    headersSent: false,
    body: undefined as any,
  }
  return res
}

// Helper to parse JSON response
function parseResponse(res: ServerResponse): any {
  if (typeof res.body === 'string') {
    return JSON.parse(res.body)
  }
  return res.body
}

describe('api/tickets/move.ts handler', () => {
  let mockCreateClient: MockedFunction<any>

  beforeEach(async () => {
    vi.clearAllMocks()
    const { createClient } = await import('@supabase/supabase-js')
    mockCreateClient = createClient as MockedFunction<any>
  })

  describe('Request validation failures', () => {
    it('returns 400 when ticketPk and ticketId are both missing', async () => {
      const req = createMockRequest({ columnId: 'col-todo' })
      const res = createMockResponse()

      await handler(req, res)

      expect(res.statusCode).toBe(400)
      const body = parseResponse(res)
      expect(body.success).toBe(false)
      expect(body.error).toContain('ticketPk')
      expect(body.error).toContain('ticketId')
    })

    it('returns 400 when columnId and columnName are both missing', async () => {
      const req = createMockRequest({ ticketId: '123' })
      const res = createMockResponse()

      await handler(req, res)

      expect(res.statusCode).toBe(400)
      const body = parseResponse(res)
      expect(body.success).toBe(false)
      expect(body.error).toContain('columnId')
      expect(body.error).toContain('columnName')
    })
  })

  describe('Column name resolution', () => {
    it('resolves columnName "todo" to To-do column', async () => {
      const mockClient = createMockSupabaseClient({
        columnsResult: {
          data: [
            { id: 'col-todo', title: 'To-do' },
            { id: 'col-doing', title: 'Doing' },
          ],
          error: null,
        },
        ticketResult: {
          data: { pk: 'ticket-pk-1', repo_full_name: 'test/repo', kanban_column_id: 'col-todo', kanban_position: 0 },
          error: null,
        },
        ticketsInColumnResult: {
          data: [],
          error: null,
        },
        updateResult: {
          data: {},
          error: null,
        },
      })
      mockCreateClient.mockReturnValue(mockClient)

      const req = createMockRequest({
        ticketId: '123',
        columnName: 'todo',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
      })
      const res = createMockResponse()

      await handler(req, res)

      expect(res.statusCode).toBe(200)
      const body = parseResponse(res)
      expect(body.success).toBe(true)
      expect(body.columnId).toBe('col-todo')
    })

    it('resolves columnName "qa" to a QA column', async () => {
      const mockClient = createMockSupabaseClient({
        columnsResult: {
          data: [
            { id: 'col-qa', title: 'Ready for QA' },
            { id: 'col-todo', title: 'To-do' },
          ],
          error: null,
        },
        ticketResult: {
          data: { pk: 'ticket-pk-1', repo_full_name: 'test/repo', kanban_column_id: 'col-todo', kanban_position: 0 },
          error: null,
        },
        ticketsInColumnResult: {
          data: [],
          error: null,
        },
        artifactsResult: {
          data: [
            { title: 'Plan for ticket 123', agent_type: 'implementation', body_md: 'test' },
            { title: 'Worklog for ticket 123', agent_type: 'implementation', body_md: 'test' },
            { title: 'Changed Files for ticket 123', agent_type: 'implementation', body_md: 'test' },
            { title: 'Decisions for ticket 123', agent_type: 'implementation', body_md: 'test' },
            { title: 'Verification for ticket 123', agent_type: 'implementation', body_md: 'test' },
            { title: 'PM Review for ticket 123', agent_type: 'implementation', body_md: 'test' },
            { title: 'Git diff for ticket 123', agent_type: 'implementation', body_md: 'test' },
            { title: 'Instructions Used for ticket 123', agent_type: 'implementation', body_md: 'test' },
          ],
          error: null,
        },
        updateResult: {
          data: {},
          error: null,
        },
      })
      mockCreateClient.mockReturnValue(mockClient)

      const req = createMockRequest({
        ticketId: '123',
        columnName: 'qa',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
      })
      const res = createMockResponse()

      await handler(req, res)

      expect(res.statusCode).toBe(200)
      const body = parseResponse(res)
      expect(body.success).toBe(true)
      expect(body.columnId).toBe('col-qa')
    })

    it('returns success: false with helpful error for unknown column name', async () => {
      const mockClient = createMockSupabaseClient({
        columnsResult: {
          data: [
            { id: 'col-todo', title: 'To-do' },
            { id: 'col-doing', title: 'Doing' },
          ],
          error: null,
        },
      })
      mockCreateClient.mockReturnValue(mockClient)

      const req = createMockRequest({
        ticketId: '123',
        columnName: 'unknown-column',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
      })
      const res = createMockResponse()

      await handler(req, res)

      expect(res.statusCode).toBe(200)
      const body = parseResponse(res)
      expect(body.success).toBe(false)
      expect(body.error).toContain('not found')
      expect(body.error).toContain('Available columns')
    })
  })

  describe('Ticket lookup strategies', () => {
    it('looks up ticket by ticketPk', async () => {
      const mockClient = createMockSupabaseClient({
        ticketResult: {
          data: { pk: 'ticket-pk-1', repo_full_name: 'test/repo', kanban_column_id: 'col-todo', kanban_position: 0 },
          error: null,
        },
        ticketsInColumnResult: {
          data: [],
          error: null,
        },
        updateResult: {
          data: {},
          error: null,
        },
      })
      mockCreateClient.mockReturnValue(mockClient)

      const req = createMockRequest({
        ticketPk: 'ticket-pk-1',
        columnId: 'col-doing',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
      })
      const res = createMockResponse()

      await handler(req, res)

      expect(res.statusCode).toBe(200)
      const body = parseResponse(res)
      expect(body.success).toBe(true)
      // Verify that from('tickets') was called with eq('pk', 'ticket-pk-1')
      expect(mockClient.from).toHaveBeenCalledWith('tickets')
    })

    it('looks up ticket by numeric id', async () => {
      const mockClient = createMockSupabaseClient({
        ticketResult: {
          data: { pk: 'ticket-pk-1', repo_full_name: 'test/repo', kanban_column_id: 'col-todo', kanban_position: 0 },
          error: null,
        },
        ticketsInColumnResult: {
          data: [],
          error: null,
        },
        updateResult: {
          data: {},
          error: null,
        },
      })
      mockCreateClient.mockReturnValue(mockClient)

      const req = createMockRequest({
        ticketId: '172',
        columnId: 'col-doing',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
      })
      const res = createMockResponse()

      await handler(req, res)

      expect(res.statusCode).toBe(200)
      const body = parseResponse(res)
      expect(body.success).toBe(true)
    })

    it('looks up ticket by display_id (e.g., HAL-0172)', async () => {
      // First query (by id) fails, second query (by display_id) succeeds
      const mockClient = createMockSupabaseClient({
        ticketResult: (field: string, value: any) => {
          if (field === 'id' && value === 'HAL-0172') {
            // First strategy fails
            return { data: null, error: null }
          }
          if (field === 'display_id' && value === 'HAL-0172') {
            // Second strategy succeeds
            return {
              data: { pk: 'ticket-pk-1', repo_full_name: 'test/repo', kanban_column_id: 'col-todo', kanban_position: 0 },
              error: null,
            }
          }
          return { data: null, error: null }
        },
        ticketsInColumnResult: {
          data: [],
          error: null,
        },
        updateResult: {
          data: {},
          error: null,
        },
      })
      mockCreateClient.mockReturnValue(mockClient)

      const req = createMockRequest({
        ticketId: 'HAL-0172',
        columnId: 'col-doing',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
      })
      const res = createMockResponse()

      await handler(req, res)

      expect(res.statusCode).toBe(200)
      const body = parseResponse(res)
      expect(body.success).toBe(true)
    })

    it('looks up ticket by leading-zero numeric id (e.g., 0172)', async () => {
      // First query (by id "0172") fails, then tries without leading zeros ("172") and succeeds
      const mockClient = createMockSupabaseClient({
        ticketResult: (field: string, value: any) => {
          if (field === 'id' && value === '0172') {
            // First strategy fails
            return { data: null, error: null }
          }
          if (field === 'display_id' && value === '0172') {
            // Second strategy fails
            return { data: null, error: null }
          }
          if (field === 'id' && value === '172') {
            // Fourth strategy (without leading zeros) succeeds
            return {
              data: { pk: 'ticket-pk-1', repo_full_name: 'test/repo', kanban_column_id: 'col-todo', kanban_position: 0 },
              error: null,
            }
          }
          return { data: null, error: null }
        },
        ticketsInColumnResult: {
          data: [],
          error: null,
        },
        updateResult: {
          data: {},
          error: null,
        },
      })
      mockCreateClient.mockReturnValue(mockClient)

      const req = createMockRequest({
        ticketId: '0172',
        columnId: 'col-doing',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
      })
      const res = createMockResponse()

      await handler(req, res)

      expect(res.statusCode).toBe(200)
      const body = parseResponse(res)
      expect(body.success).toBe(true)
    })
  })
})
