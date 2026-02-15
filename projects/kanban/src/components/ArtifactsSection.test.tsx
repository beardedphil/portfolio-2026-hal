import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ArtifactsSection } from './ArtifactsSection'
import type { SupabaseAgentArtifactRow } from './types'

describe('ArtifactsSection', () => {
  const mockOnOpenArtifact = () => {}

  it('renders heading when artifacts are present', () => {
    const artifacts: SupabaseAgentArtifactRow[] = [
      {
        artifact_id: 'art-1',
        ticket_pk: 'ticket-1',
        repo_full_name: 'test/repo',
        agent_type: 'implementation',
        title: 'Plan for ticket HAL-0606',
        body_md: 'Test plan content',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ]

    render(
      <ArtifactsSection
        artifacts={artifacts}
        loading={false}
        onOpenArtifact={mockOnOpenArtifact}
      />
    )

    expect(screen.getByText('Artifacts')).toBeInTheDocument()
    expect(screen.getByText('Plan for ticket HAL-0606')).toBeInTheDocument()
  })

  it('renders loading state', () => {
    render(
      <ArtifactsSection
        artifacts={[]}
        loading={true}
        onOpenArtifact={mockOnOpenArtifact}
      />
    )

    expect(screen.getByText('Loading artifacts…')).toBeInTheDocument()
  })

  it('renders empty state', () => {
    render(
      <ArtifactsSection
        artifacts={[]}
        loading={false}
        onOpenArtifact={mockOnOpenArtifact}
      />
    )

    expect(screen.getByText('No artifacts available for this ticket.')).toBeInTheDocument()
  })

  it('renders with minimal props without runtime errors', () => {
    expect(() => {
      render(
        <ArtifactsSection
          artifacts={[]}
          loading={false}
          onOpenArtifact={mockOnOpenArtifact}
        />
      )
    }).not.toThrow()
  })
})
