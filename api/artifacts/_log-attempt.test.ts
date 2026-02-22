import { describe, it, expect, vi, beforeEach } from 'vitest'
import { logStorageAttempt } from './_log-attempt.js'

describe('logStorageAttempt', () => {
  let mockSupabase: any

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
  })

  it('should log successful storage attempt', async () => {
    await logStorageAttempt(
      mockSupabase,
      'ticket-pk-123',
      'owner/repo',
      'plan',
      'implementation',
      '/api/artifacts/insert-implementation',
      'stored'
    )

    expect(mockSupabase.from).toHaveBeenCalledWith('artifact_storage_attempts')
    expect(mockSupabase.insert).toHaveBeenCalledWith({
      ticket_pk: 'ticket-pk-123',
      repo_full_name: 'owner/repo',
      artifact_type: 'plan',
      agent_type: 'implementation',
      endpoint: '/api/artifacts/insert-implementation',
      outcome: 'stored',
      error_message: null,
      validation_reason: null,
    })
  })

  it('should log rejected attempt with validation reason', async () => {
    await logStorageAttempt(
      mockSupabase,
      'ticket-pk-456',
      'owner/repo',
      'worklog',
      'qa',
      '/api/artifacts/insert-qa',
      'rejected by validation',
      undefined,
      'Missing required field: body_md'
    )

    expect(mockSupabase.insert).toHaveBeenCalledWith({
      ticket_pk: 'ticket-pk-456',
      repo_full_name: 'owner/repo',
      artifact_type: 'worklog',
      agent_type: 'qa',
      endpoint: '/api/artifacts/insert-qa',
      outcome: 'rejected by validation',
      error_message: null,
      validation_reason: 'Missing required field: body_md',
    })
  })

  it('should log failed request with error message', async () => {
    await logStorageAttempt(
      mockSupabase,
      'ticket-pk-789',
      'owner/repo',
      'plan',
      'implementation',
      '/api/artifacts/insert-implementation',
      'request failed',
      'Network timeout'
    )

    expect(mockSupabase.insert).toHaveBeenCalledWith({
      ticket_pk: 'ticket-pk-789',
      repo_full_name: 'owner/repo',
      artifact_type: 'plan',
      agent_type: 'implementation',
      endpoint: '/api/artifacts/insert-implementation',
      outcome: 'request failed',
      error_message: 'Network timeout',
      validation_reason: null,
    })
  })

  it('should handle Supabase errors gracefully', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const supabaseError = new Error('Database connection failed')
    mockSupabase.insert.mockRejectedValue(supabaseError)

    // Should not throw
    await expect(
      logStorageAttempt(
        mockSupabase,
        'ticket-pk-123',
        'owner/repo',
        'plan',
        'implementation',
        '/api/artifacts/insert-implementation',
        'stored'
      )
    ).resolves.toBeUndefined()

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[logStorageAttempt] Failed to log attempt: Database connection failed')
    )

    consoleWarnSpy.mockRestore()
  })

  it('should handle non-Error exceptions', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockSupabase.insert.mockRejectedValue('String error')

    await expect(
      logStorageAttempt(
        mockSupabase,
        'ticket-pk-123',
        'owner/repo',
        'plan',
        'implementation',
        '/api/artifacts/insert-implementation',
        'stored'
      )
    ).resolves.toBeUndefined()

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[logStorageAttempt] Failed to log attempt: String error')
    )

    consoleWarnSpy.mockRestore()
  })
})
