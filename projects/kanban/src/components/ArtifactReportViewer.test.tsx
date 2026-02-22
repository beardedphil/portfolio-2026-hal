import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ArtifactReportViewer } from './ArtifactReportViewer'
import type { SupabaseAgentArtifactRow } from './types'

describe('ArtifactReportViewer', () => {
  const mockOnClose = vi.fn()
  const mockOnNavigate = vi.fn()

  const mockArtifact: SupabaseAgentArtifactRow = {
    artifact_id: 'art-1',
    ticket_pk: 'ticket-1',
    repo_full_name: 'test/repo',
    agent_type: 'implementation',
    title: 'Plan for ticket HAL-0606',
    body_md: '# Test Plan\n\nThis is a test plan content.',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  }

  const mockArtifacts: SupabaseAgentArtifactRow[] = [
    {
      ...mockArtifact,
      artifact_id: 'art-1',
      created_at: '2024-01-01T00:00:00Z',
    },
    {
      ...mockArtifact,
      artifact_id: 'art-2',
      title: 'Worklog for ticket HAL-0606',
      created_at: '2024-01-02T00:00:00Z',
    },
    {
      ...mockArtifact,
      artifact_id: 'art-3',
      title: 'Verification for ticket HAL-0606',
      created_at: '2024-01-03T00:00:00Z',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    document.body.style.overflow = ''
  })

  afterEach(() => {
    document.body.style.overflow = ''
  })

  describe('Modal visibility and rendering', () => {
    it('does not render when open is false', () => {
      const { container } = render(
        <ArtifactReportViewer
          open={false}
          onClose={mockOnClose}
          artifact={mockArtifact}
          artifacts={mockArtifacts}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(container.firstChild).toBeNull()
    })

    it('renders modal with artifact title when open', () => {
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={mockArtifact}
          artifacts={mockArtifacts}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.getByText('Plan for ticket HAL-0606')).toBeInTheDocument()
      expect(screen.getByText('Agent type: Implementation report')).toBeInTheDocument()
    })

    it('renders artifact body markdown content', () => {
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={mockArtifact}
          artifacts={mockArtifacts}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.getByText('Test Plan')).toBeInTheDocument()
      expect(screen.getByText('This is a test plan content.')).toBeInTheDocument()
    })

    it('calls onClose when clicking backdrop', () => {
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={mockArtifact}
          artifacts={mockArtifacts}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      const backdrop = screen.getByRole('dialog')
      fireEvent.click(backdrop)

      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('calls onClose when clicking close button', () => {
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={mockArtifact}
          artifacts={mockArtifacts}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      const closeButton = screen.getByLabelText('Close')
      fireEvent.click(closeButton)

      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('Navigation functionality', () => {
    it('renders navigation buttons when multiple artifacts exist', () => {
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={mockArtifacts[0]}
          artifacts={mockArtifacts}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.getByText('1 of 3')).toBeInTheDocument()
      expect(screen.getByLabelText('Previous artifact')).toBeInTheDocument()
      expect(screen.getByLabelText('Next artifact')).toBeInTheDocument()
    })

    it('does not render navigation when only one artifact exists', () => {
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={mockArtifact}
          artifacts={[mockArtifact]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.queryByText('1 of 1')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Previous artifact')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Next artifact')).not.toBeInTheDocument()
    })

    it('disables Previous button on first artifact', () => {
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={mockArtifacts[0]}
          artifacts={mockArtifacts}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      const prevButton = screen.getByLabelText('Previous artifact')
      expect(prevButton).toBeDisabled()
    })

    it('disables Next button on last artifact', () => {
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={mockArtifacts[2]}
          artifacts={mockArtifacts}
          currentIndex={2}
          onNavigate={mockOnNavigate}
        />
      )

      const nextButton = screen.getByLabelText('Next artifact')
      expect(nextButton).toBeDisabled()
    })

    it('calls onNavigate with previous index when Previous is clicked', () => {
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={mockArtifacts[1]}
          artifacts={mockArtifacts}
          currentIndex={1}
          onNavigate={mockOnNavigate}
        />
      )

      const prevButton = screen.getByLabelText('Previous artifact')
      fireEvent.click(prevButton)

      expect(mockOnNavigate).toHaveBeenCalledWith(0)
    })

    it('calls onNavigate with next index when Next is clicked', () => {
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={mockArtifacts[0]}
          artifacts={mockArtifacts}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      const nextButton = screen.getByLabelText('Next artifact')
      fireEvent.click(nextButton)

      expect(mockOnNavigate).toHaveBeenCalledWith(1)
    })

    it('sorts artifacts chronologically for navigation', () => {
      const unsortedArtifacts: SupabaseAgentArtifactRow[] = [
        {
          ...mockArtifact,
          artifact_id: 'art-3',
          created_at: '2024-01-03T00:00:00Z',
        },
        {
          ...mockArtifact,
          artifact_id: 'art-1',
          created_at: '2024-01-01T00:00:00Z',
        },
        {
          ...mockArtifact,
          artifact_id: 'art-2',
          created_at: '2024-01-02T00:00:00Z',
        },
      ]

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={unsortedArtifacts[1]} // art-1 (oldest)
          artifacts={unsortedArtifacts}
          currentIndex={1}
          onNavigate={mockOnNavigate}
        />
      )

      // Should show "1 of 3" indicating it's the first in sorted order
      expect(screen.getByText('1 of 3')).toBeInTheDocument()
    })
  })

  describe('Git diff detection and rendering', () => {
    it('detects git diff artifact by title prefix', () => {
      const gitDiffArtifact: SupabaseAgentArtifactRow = {
        ...mockArtifact,
        title: 'git diff for ticket HAL-0606',
        body_md: 'diff --git a/file.ts b/file.ts\n@@ -1,2 +1,2 @@\n-old\n+new',
      }

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={gitDiffArtifact}
          artifacts={[gitDiffArtifact]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.getByText('git diff for ticket HAL-0606')).toBeInTheDocument()
      // GitDiffViewer should be rendered instead of ReactMarkdown
      // We can verify this by checking that the diff content is present
      // (GitDiffViewer renders the diff in a specific format)
    })

    it('detects git diff artifact with alternative title format', () => {
      const gitDiffArtifact: SupabaseAgentArtifactRow = {
        ...mockArtifact,
        title: 'git-diff for ticket HAL-0606',
        body_md: 'diff --git a/file.ts b/file.ts',
      }

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={gitDiffArtifact}
          artifacts={[gitDiffArtifact]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.getByText('git-diff for ticket HAL-0606')).toBeInTheDocument()
    })

    it('renders empty state message for git diff with no content', () => {
      const gitDiffArtifact: SupabaseAgentArtifactRow = {
        ...mockArtifact,
        title: 'git diff for ticket HAL-0606',
        body_md: '   ', // Whitespace only to trigger trimmed check
      }

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={gitDiffArtifact}
          artifacts={[gitDiffArtifact]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.getByText(/No diff available/)).toBeInTheDocument()
    })
  })

  describe('Invalid artifact handling', () => {
    it('renders error message when artifact is null', () => {
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={null}
          artifacts={[]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.getByText(/No artifact selected/)).toBeInTheDocument()
    })

    it('renders error message when artifact has no artifact_id', () => {
      const invalidArtifact = {
        ...mockArtifact,
        artifact_id: '',
      }

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={invalidArtifact as SupabaseAgentArtifactRow}
          artifacts={[]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.getByText(/Invalid artifact data/)).toBeInTheDocument()
    })

    it('renders error message when artifact has no body_md', () => {
      const artifactWithoutBody: SupabaseAgentArtifactRow = {
        ...mockArtifact,
        body_md: '',
      }

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifactWithoutBody}
          artifacts={[artifactWithoutBody]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.getByText(/No content available/)).toBeInTheDocument()
    })

    it('renders empty state message for artifact with only whitespace', () => {
      const artifactWithWhitespace: SupabaseAgentArtifactRow = {
        ...mockArtifact,
        body_md: '   \n\t  \n  ',
      }

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifactWithWhitespace}
          artifacts={[artifactWithWhitespace]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.getByText(/No output produced/)).toBeInTheDocument()
    })
  })

  describe('Keyboard navigation', () => {
    it('calls onClose when Escape key is pressed', () => {
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={mockArtifact}
          artifacts={mockArtifacts}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      const backdrop = screen.getByRole('dialog')
      fireEvent.keyDown(backdrop, { key: 'Escape' })

      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('prevents body scroll when modal is open', () => {
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={mockArtifact}
          artifacts={mockArtifacts}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(document.body.style.overflow).toBe('hidden')
    })

    it('sets body overflow to hidden when modal opens', () => {
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={mockArtifact}
          artifacts={mockArtifacts}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(document.body.style.overflow).toBe('hidden')
    })
  })

  describe('Agent type display', () => {
    it('displays correct agent type for implementation', () => {
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={mockArtifact}
          artifacts={mockArtifacts}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.getByText('Agent type: Implementation report')).toBeInTheDocument()
    })

    it('displays correct agent type for qa', () => {
      const qaArtifact: SupabaseAgentArtifactRow = {
        ...mockArtifact,
        agent_type: 'qa',
      }

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={qaArtifact}
          artifacts={[qaArtifact]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.getByText('Agent type: QA report')).toBeInTheDocument()
    })

    it('displays correct agent type for human-in-the-loop', () => {
      const hitlArtifact: SupabaseAgentArtifactRow = {
        ...mockArtifact,
        agent_type: 'human-in-the-loop',
      }

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={hitlArtifact}
          artifacts={[hitlArtifact]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.getByText('Agent type: Human-in-the-Loop report')).toBeInTheDocument()
    })
  })
})
