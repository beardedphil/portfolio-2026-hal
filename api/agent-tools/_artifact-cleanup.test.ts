import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  separateArtifactsByContent,
  deleteEmptyArtifacts,
  selectTargetArtifact,
  deleteDuplicateArtifacts,
  type Artifact,
} from './_artifact-cleanup.js'

// Mock Supabase client interface
interface MockSupabaseClient {
  from: (table: string) => {
    delete: () => {
      in: (column: string, values: string[]) => Promise<{ error: any }>
    }
  }
}

describe('separateArtifactsByContent', () => {
  it('should separate artifacts with content from empty ones', () => {
    const artifacts: Artifact[] = [
      {
        artifact_id: '1',
        body_md: 'This is a substantial artifact with enough content to pass validation.',
        created_at: '2024-01-01T00:00:00Z',
      },
      {
        artifact_id: '2',
        body_md: '# Title\n\n',
        created_at: '2024-01-02T00:00:00Z',
      },
      {
        artifact_id: '3',
        body_md: 'Another substantial artifact with real content that exceeds the minimum length requirement.',
        created_at: '2024-01-03T00:00:00Z',
      },
    ]

    const result = separateArtifactsByContent(artifacts, 'Plan for ticket 123', false)

    expect(result.artifactsWithContent).toHaveLength(2)
    expect(result.artifactsWithContent.map((a) => a.artifact_id)).toEqual(['1', '3'])
    expect(result.emptyArtifactIds).toEqual(['2'])
  })

  it('should handle all empty artifacts', () => {
    const artifacts: Artifact[] = [
      {
        artifact_id: '1',
        body_md: '# Title',
        created_at: '2024-01-01T00:00:00Z',
      },
      {
        artifact_id: '2',
        body_md: '',
        created_at: '2024-01-02T00:00:00Z',
      },
    ]

    const result = separateArtifactsByContent(artifacts, 'Plan for ticket 123', false)

    expect(result.artifactsWithContent).toHaveLength(0)
    expect(result.emptyArtifactIds).toEqual(['1', '2'])
  })

  it('should handle all artifacts with content', () => {
    const artifacts: Artifact[] = [
      {
        artifact_id: '1',
        body_md: 'This is a substantial artifact with enough content to pass validation.',
        created_at: '2024-01-01T00:00:00Z',
      },
      {
        artifact_id: '2',
        body_md: 'Another substantial artifact with real content that exceeds the minimum length requirement.',
        created_at: '2024-01-02T00:00:00Z',
      },
    ]

    const result = separateArtifactsByContent(artifacts, 'Plan for ticket 123', false)

    expect(result.artifactsWithContent).toHaveLength(2)
    expect(result.emptyArtifactIds).toHaveLength(0)
  })

  it('should use QA validation when specified', () => {
    const artifacts: Artifact[] = [
      {
        artifact_id: '1',
        body_md: 'This is a substantial QA report with enough content to pass validation. It contains detailed information about the testing process and results that exceed the minimum length requirement for QA artifacts.',
        created_at: '2024-01-01T00:00:00Z',
      },
      {
        artifact_id: '2',
        body_md: '# QA Report',
        created_at: '2024-01-02T00:00:00Z',
      },
    ]

    const result = separateArtifactsByContent(artifacts, 'QA report for ticket 123', true)

    expect(result.artifactsWithContent).toHaveLength(1)
    expect(result.emptyArtifactIds).toEqual(['2'])
  })
})

describe('deleteEmptyArtifacts', () => {
  it('should return success when no artifacts to delete', async () => {
    const mockSupabase = {} as unknown as SupabaseClient
    const result = await deleteEmptyArtifacts(mockSupabase, [])
    expect(result.success).toBe(true)
  })

  it('should delete empty artifacts successfully', async () => {
    const deleteMock = vi.fn().mockResolvedValue({ error: null })
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        delete: vi.fn().mockReturnValue({
          in: deleteMock,
        }),
      }),
    } as unknown as SupabaseClient

    const result = await deleteEmptyArtifacts(mockSupabase, ['1', '2'])

    expect(result.success).toBe(true)
    expect(mockSupabase.from).toHaveBeenCalledWith('agent_artifacts')
    expect(deleteMock).toHaveBeenCalledWith('artifact_id', ['1', '2'])
  })

  it('should handle deletion errors', async () => {
    const deleteError = { message: 'Database error' }
    const deleteMock = vi.fn().mockResolvedValue({ error: deleteError })
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        delete: vi.fn().mockReturnValue({
          in: deleteMock,
        }),
      }),
    } as unknown as SupabaseClient

    const result = await deleteEmptyArtifacts(mockSupabase, ['1'])

    expect(result.success).toBe(false)
    expect(result.error).toBe('Database error')
  })
})

describe('selectTargetArtifact', () => {
  it('should select most recent artifact with content', () => {
    const artifacts: Artifact[] = [
      { artifact_id: '1', body_md: 'content', created_at: '2024-01-01T00:00:00Z' },
      { artifact_id: '2', body_md: 'content', created_at: '2024-01-02T00:00:00Z' },
      { artifact_id: '3', body_md: '', created_at: '2024-01-03T00:00:00Z' },
    ]

    const artifactsWithContent = [
      { artifact_id: '2', created_at: '2024-01-02T00:00:00Z' },
      { artifact_id: '1', created_at: '2024-01-01T00:00:00Z' },
    ]

    const result = selectTargetArtifact(artifacts, artifactsWithContent, ['3'])

    expect(result).toBe('2')
  })

  it('should select remaining artifact if all with content were deleted', () => {
    const artifacts: Artifact[] = [
      { artifact_id: '1', body_md: '', created_at: '2024-01-01T00:00:00Z' },
      { artifact_id: '2', body_md: '', created_at: '2024-01-02T00:00:00Z' },
    ]

    const result = selectTargetArtifact(artifacts, [], ['1'])

    expect(result).toBe('2')
  })

  it('should return null if no artifacts available', () => {
    const artifacts: Artifact[] = []
    const result = selectTargetArtifact(artifacts, [], [])
    expect(result).toBeNull()
  })
})

describe('deleteDuplicateArtifacts', () => {
  it('should delete all artifacts except target', async () => {
    const deleteMock = vi.fn().mockResolvedValue({ error: null })
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        delete: vi.fn().mockReturnValue({
          in: deleteMock,
        }),
      }),
    } as unknown as SupabaseClient

    const artifacts: Artifact[] = [
      { artifact_id: '1', body_md: 'content', created_at: '2024-01-01T00:00:00Z' },
      { artifact_id: '2', body_md: 'content', created_at: '2024-01-02T00:00:00Z' },
      { artifact_id: '3', body_md: 'content', created_at: '2024-01-03T00:00:00Z' },
    ]

    const result = await deleteDuplicateArtifacts(mockSupabase, artifacts, '2', [])

    expect(result.deletedIds).toEqual(['1', '3'])
    expect(result.error).toBeUndefined()
    expect(deleteMock).toHaveBeenCalledWith('artifact_id', ['1', '3'])
  })

  it('should exclude empty artifacts from deletion', async () => {
    const deleteMock = vi.fn().mockResolvedValue({ error: null })
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        delete: vi.fn().mockReturnValue({
          in: deleteMock,
        }),
      }),
    } as unknown as SupabaseClient

    const artifacts: Artifact[] = [
      { artifact_id: '1', body_md: 'content', created_at: '2024-01-01T00:00:00Z' },
      { artifact_id: '2', body_md: 'content', created_at: '2024-01-02T00:00:00Z' },
      { artifact_id: '3', body_md: '', created_at: '2024-01-03T00:00:00Z' },
    ]

    const result = await deleteDuplicateArtifacts(mockSupabase, artifacts, '2', ['3'])

    expect(result.deletedIds).toEqual(['1'])
    expect(deleteMock).toHaveBeenCalledWith('artifact_id', ['1'])
  })

  it('should return empty array when no duplicates', async () => {
    const mockSupabase = {} as unknown as SupabaseClient
    const artifacts: Artifact[] = [
      { artifact_id: '1', body_md: 'content', created_at: '2024-01-01T00:00:00Z' },
    ]

    const result = await deleteDuplicateArtifacts(mockSupabase, artifacts, '1', [])

    expect(result.deletedIds).toEqual([])
  })

  it('should handle deletion errors', async () => {
    const deleteError = { message: 'Database error' }
    const deleteMock = vi.fn().mockResolvedValue({ error: deleteError })
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        delete: vi.fn().mockReturnValue({
          in: deleteMock,
        }),
      }),
    } as unknown as SupabaseClient

    const artifacts: Artifact[] = [
      { artifact_id: '1', body_md: 'content', created_at: '2024-01-01T00:00:00Z' },
      { artifact_id: '2', body_md: 'content', created_at: '2024-01-02T00:00:00Z' },
    ]

    const result = await deleteDuplicateArtifacts(mockSupabase, artifacts, '2', [])

    expect(result.deletedIds).toEqual(['1'])
    expect(result.error).toBe('Database error')
  })
})
