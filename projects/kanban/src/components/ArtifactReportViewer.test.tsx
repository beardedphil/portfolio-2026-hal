import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ArtifactReportViewer } from './ArtifactReportViewer'
import type { SupabaseAgentArtifactRow } from '../App.types'

describe('ArtifactReportViewer', () => {
  const mockOnClose = vi.fn()
  const mockOnNavigate = vi.fn()

  const createMockArtifact = (overrides?: Partial<SupabaseAgentArtifactRow>): SupabaseAgentArtifactRow => ({
    artifact_id: 'artifact-1',
    ticket_pk: 'ticket-1',
    repo_full_name: 'test/repo',
    agent_type: 'implementation',
    title: 'Test Artifact',
    body_md: '# Test Content\n\nThis is test content.',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock document.body.style.overflow
    Object.defineProperty(document.body, 'style', {
      value: { overflow: '' },
      writable: true,
    })
  })

  describe('Rendering behavior', () => {
    it('does not render when open is false', () => {
      const artifact = createMockArtifact()
      const { container } = render(
        <ArtifactReportViewer
          open={false}
          onClose={mockOnClose}
          artifact={artifact}
          artifacts={[artifact]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(container.firstChild).toBeNull()
    })

    it('renders when open is true and artifact is provided', () => {
      const artifact = createMockArtifact()
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact}
          artifacts={[artifact]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('Test Artifact')).toBeInTheDocument()
      expect(screen.getByText('Test Content')).toBeInTheDocument()
    })

    it('renders with "Untitled Artifact" when title is missing', () => {
      const artifact = createMockArtifact({ title: '' })
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact}
          artifacts={[artifact]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.getByText('Untitled Artifact')).toBeInTheDocument()
    })
  })

  describe('Invalid artifact handling', () => {
    it('displays error message when artifact is null', () => {
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

    it('displays error message when artifact_id is missing', () => {
      const artifact = createMockArtifact({ artifact_id: '' })
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact}
          artifacts={[artifact]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.getByText(/Invalid artifact data/)).toBeInTheDocument()
    })

    it('displays message when body_md is missing', () => {
      const artifact = createMockArtifact({ body_md: '' })
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact}
          artifacts={[artifact]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.getByText(/No content available/)).toBeInTheDocument()
    })

    it('displays message when body_md is only whitespace', () => {
      const artifact = createMockArtifact({ body_md: '   \n\t  ' })
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact}
          artifacts={[artifact]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.getByText(/No output produced/)).toBeInTheDocument()
    })
  })

  describe('Navigation behavior', () => {
    it('enables Previous button when not at first artifact', () => {
      const artifacts = [
        createMockArtifact({ artifact_id: 'artifact-1', title: 'First', created_at: '2024-01-01T00:00:00Z' }),
        createMockArtifact({ artifact_id: 'artifact-2', title: 'Second', created_at: '2024-01-02T00:00:00Z' }),
        createMockArtifact({ artifact_id: 'artifact-3', title: 'Third', created_at: '2024-01-03T00:00:00Z' }),
      ]

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifacts[1]}
          artifacts={artifacts}
          currentIndex={1}
          onNavigate={mockOnNavigate}
        />
      )

      const prevButton = screen.getByLabelText('Previous artifact')
      expect(prevButton).not.toBeDisabled()
    })

    it('disables Previous button when at first artifact', () => {
      const artifacts = [
        createMockArtifact({ artifact_id: 'artifact-1', title: 'First', created_at: '2024-01-01T00:00:00Z' }),
        createMockArtifact({ artifact_id: 'artifact-2', title: 'Second', created_at: '2024-01-02T00:00:00Z' }),
      ]

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifacts[0]}
          artifacts={artifacts}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      const prevButton = screen.getByLabelText('Previous artifact')
      expect(prevButton).toBeDisabled()
    })

    it('enables Next button when not at last artifact', () => {
      const artifacts = [
        createMockArtifact({ artifact_id: 'artifact-1', title: 'First', created_at: '2024-01-01T00:00:00Z' }),
        createMockArtifact({ artifact_id: 'artifact-2', title: 'Second', created_at: '2024-01-02T00:00:00Z' }),
        createMockArtifact({ artifact_id: 'artifact-3', title: 'Third', created_at: '2024-01-03T00:00:00Z' }),
      ]

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifacts[1]}
          artifacts={artifacts}
          currentIndex={1}
          onNavigate={mockOnNavigate}
        />
      )

      const nextButton = screen.getByLabelText('Next artifact')
      expect(nextButton).not.toBeDisabled()
    })

    it('disables Next button when at last artifact', () => {
      const artifacts = [
        createMockArtifact({ artifact_id: 'artifact-1', title: 'First', created_at: '2024-01-01T00:00:00Z' }),
        createMockArtifact({ artifact_id: 'artifact-2', title: 'Second', created_at: '2024-01-02T00:00:00Z' }),
      ]

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifacts[1]}
          artifacts={artifacts}
          currentIndex={1}
          onNavigate={mockOnNavigate}
        />
      )

      const nextButton = screen.getByLabelText('Next artifact')
      expect(nextButton).toBeDisabled()
    })

    it('calls onNavigate with previous index when Previous button is clicked', () => {
      const artifacts = [
        createMockArtifact({ artifact_id: 'artifact-1', title: 'First', created_at: '2024-01-01T00:00:00Z' }),
        createMockArtifact({ artifact_id: 'artifact-2', title: 'Second', created_at: '2024-01-02T00:00:00Z' }),
      ]

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifacts[1]}
          artifacts={artifacts}
          currentIndex={1}
          onNavigate={mockOnNavigate}
        />
      )

      const prevButton = screen.getByLabelText('Previous artifact')
      fireEvent.click(prevButton)

      expect(mockOnNavigate).toHaveBeenCalledTimes(1)
      expect(mockOnNavigate).toHaveBeenCalledWith(0)
    })

    it('calls onNavigate with next index when Next button is clicked', () => {
      const artifacts = [
        createMockArtifact({ artifact_id: 'artifact-1', title: 'First', created_at: '2024-01-01T00:00:00Z' }),
        createMockArtifact({ artifact_id: 'artifact-2', title: 'Second', created_at: '2024-01-02T00:00:00Z' }),
      ]

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifacts[0]}
          artifacts={artifacts}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      const nextButton = screen.getByLabelText('Next artifact')
      fireEvent.click(nextButton)

      expect(mockOnNavigate).toHaveBeenCalledTimes(1)
      expect(mockOnNavigate).toHaveBeenCalledWith(1)
    })

    it('displays correct counter when multiple artifacts exist', () => {
      const artifacts = [
        createMockArtifact({ artifact_id: 'artifact-1', title: 'First', created_at: '2024-01-01T00:00:00Z' }),
        createMockArtifact({ artifact_id: 'artifact-2', title: 'Second', created_at: '2024-01-02T00:00:00Z' }),
        createMockArtifact({ artifact_id: 'artifact-3', title: 'Third', created_at: '2024-01-03T00:00:00Z' }),
      ]

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifacts[1]}
          artifacts={artifacts}
          currentIndex={1}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.getByText('2 of 3')).toBeInTheDocument()
    })

    it('hides navigation buttons when only one artifact exists', () => {
      const artifact = createMockArtifact()
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact}
          artifacts={[artifact]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.queryByLabelText('Previous artifact')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Next artifact')).not.toBeInTheDocument()
    })

    it('sorts artifacts chronologically (oldest first)', () => {
      const artifacts = [
        createMockArtifact({ artifact_id: 'artifact-3', title: 'Third', created_at: '2024-01-03T00:00:00Z' }),
        createMockArtifact({ artifact_id: 'artifact-1', title: 'First', created_at: '2024-01-01T00:00:00Z' }),
        createMockArtifact({ artifact_id: 'artifact-2', title: 'Second', created_at: '2024-01-02T00:00:00Z' }),
      ]

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifacts[1]} // artifact-1 (oldest)
          artifacts={artifacts}
          currentIndex={1}
          onNavigate={mockOnNavigate}
        />
      )

      // Should show "1 of 3" because artifact-1 is first in sorted order
      expect(screen.getByText('1 of 3')).toBeInTheDocument()
    })
  })

  describe('Keyboard navigation', () => {
    it('calls onClose when Escape key is pressed and image viewer is closed', () => {
      const artifact = createMockArtifact()
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact}
          artifacts={[artifact]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      const dialog = screen.getByRole('dialog')
      fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' })

      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('does not call onClose when other keys are pressed', () => {
      const artifact = createMockArtifact()
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact}
          artifacts={[artifact]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      const dialog = screen.getByRole('dialog')
      fireEvent.keyDown(dialog, { key: 'Enter', code: 'Enter' })
      fireEvent.keyDown(dialog, { key: ' ', code: 'Space' })

      expect(mockOnClose).not.toHaveBeenCalled()
    })
  })

  describe('Content rendering', () => {
    it('renders markdown content for non-git-diff artifacts', () => {
      const artifact = createMockArtifact({
        title: 'Test Report',
        body_md: '# Heading\n\nSome **bold** text.',
      })

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact}
          artifacts={[artifact]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.getByText('Heading')).toBeInTheDocument()
      expect(screen.getByText('Some')).toBeInTheDocument()
      expect(screen.getByText('bold')).toBeInTheDocument()
    })

    it('renders GitDiffViewer for git-diff artifacts', () => {
      const artifact = createMockArtifact({
        title: 'git diff for ticket HAL-123',
        body_md: 'diff --git a/file.txt b/file.txt\n@@ -1,1 +1,1 @@\n-old\n+new',
      })

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact}
          artifacts={[artifact]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      // GitDiffViewer should render the diff content
      expect(screen.getByText(/diff --git/)).toBeInTheDocument()
    })

    it('detects git-diff artifacts by title starting with "git diff for ticket"', () => {
      const artifact = createMockArtifact({
        title: 'git diff for ticket HAL-123',
        body_md: 'some diff content',
      })

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact}
          artifacts={[artifact]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      // Should use GitDiffViewer
      expect(screen.getByText(/some diff content/)).toBeInTheDocument()
    })

    it('detects git-diff artifacts by title starting with "git-diff for ticket"', () => {
      const artifact = createMockArtifact({
        title: 'git-diff for ticket HAL-123',
        body_md: 'some diff content',
      })

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact}
          artifacts={[artifact]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      // Should use GitDiffViewer
      expect(screen.getByText(/some diff content/)).toBeInTheDocument()
    })
  })

  describe('Agent type display', () => {
    it('displays correct agent type label for implementation', () => {
      const artifact = createMockArtifact({ agent_type: 'implementation' })
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact}
          artifacts={[artifact]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.getByText(/Agent type: Implementation report/)).toBeInTheDocument()
    })

    it('displays correct agent type label for qa', () => {
      const artifact = createMockArtifact({ agent_type: 'qa' })
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact}
          artifacts={[artifact]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.getByText(/Agent type: QA report/)).toBeInTheDocument()
    })
  })

  describe('Close button behavior', () => {
    it('calls onClose when close button is clicked', () => {
      const artifact = createMockArtifact()
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact}
          artifacts={[artifact]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      const closeButton = screen.getByLabelText('Close')
      fireEvent.click(closeButton)

      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })
  })
})
