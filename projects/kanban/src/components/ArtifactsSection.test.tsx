import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ArtifactsSection } from './ArtifactsSection'
import type { SupabaseAgentArtifactRow } from './types'

describe('ArtifactsSection', () => {
  it('renders loading state', () => {
    render(
      <ArtifactsSection
        artifacts={[]}
        loading={true}
        onOpenArtifact={() => {}}
      />
    )
    expect(screen.getByText('Loading artifacts…')).toBeInTheDocument()
    expect(screen.getByText('Artifacts')).toBeInTheDocument()
  })

  it('renders empty state', () => {
    render(
      <ArtifactsSection
        artifacts={[]}
        loading={false}
        onOpenArtifact={() => {}}
      />
    )
    expect(screen.getByText('No artifacts available for this ticket.')).toBeInTheDocument()
    expect(screen.getByText('Artifacts')).toBeInTheDocument()
  })

  it('renders artifacts list with key headings', () => {
    const artifacts: SupabaseAgentArtifactRow[] = [
      {
        artifact_id: '1',
        ticket_pk: 't1',
        repo_full_name: 'test/repo',
        agent_type: 'implementation',
        title: 'Plan for ticket 0001',
        body_md: 'Test plan content',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]
    render(
      <ArtifactsSection
        artifacts={artifacts}
        loading={false}
        onOpenArtifact={() => {}}
      />
    )
    expect(screen.getByText('Artifacts')).toBeInTheDocument()
    expect(screen.getByText('Plan for ticket 0001')).toBeInTheDocument()
  })

  it('handles optional props gracefully', () => {
    const artifacts: SupabaseAgentArtifactRow[] = []
    render(
      <ArtifactsSection
        artifacts={artifacts}
        loading={false}
        onOpenArtifact={() => {}}
        statusMessage={null}
        columnId={null}
      />
    )
    expect(screen.getByText('Artifacts')).toBeInTheDocument()
  })
})
