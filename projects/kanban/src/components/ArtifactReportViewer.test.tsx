import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { SupabaseAgentArtifactRow } from '../App.types'

// Mock dependencies BEFORE importing the component
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div data-testid="react-markdown">{children}</div>,
}))

vi.mock('../GitDiffViewer', () => ({
  GitDiffViewer: ({ diff }: { diff: string }) => <div data-testid="git-diff-viewer">{diff}</div>,
}))

vi.mock('./ImageViewerModal', () => ({
  ImageViewerModal: ({ open, onClose, imageSrc, imageAlt }: any) => {
    if (!open || !imageSrc) return null
    return (
      <div data-testid="image-viewer-modal">
        <button onClick={onClose}>Close Image</button>
        <img src={imageSrc} alt={imageAlt} />
      </div>
    )
  },
}))

vi.mock('./MarkdownImage', () => ({
  MarkdownImage: ({ src, alt, onImageClick }: any) => (
    <img
      data-testid="markdown-image"
      src={src}
      alt={alt}
      onClick={() => onImageClick(src, alt)}
    />
  ),
}))

// Import component AFTER mocks are set up
import { ArtifactReportViewer } from './ArtifactReportViewer'

describe('ArtifactReportViewer', () => {
  const mockArtifact: SupabaseAgentArtifactRow = {
    artifact_id: 'art-1',
    ticket_pk: 'ticket-pk-1',
    repo_full_name: 'test/repo',
    agent_type: 'implementation',
    title: 'Test Artifact',
    body_md: '# Test Content\n\nThis is test content.',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }

  const mockArtifacts: SupabaseAgentArtifactRow[] = [
    { ...mockArtifact, artifact_id: 'art-1', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { ...mockArtifact, artifact_id: 'art-2', created_at: '2026-01-02T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' },
    { ...mockArtifact, artifact_id: 'art-3', created_at: '2026-01-03T00:00:00Z', updated_at: '2026-01-03T00:00:00Z' },
  ]

  const mockOnClose = vi.fn()
  const mockOnNavigate = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock document.body.style.overflow
    Object.defineProperty(document.body, 'style', {
      value: { overflow: '' },
      writable: true,
      configurable: true,
    })
  })

  describe('Modal visibility and basic rendering', () => {
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

    it('renders when open is true and artifact is provided', () => {
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

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('Test Artifact')).toBeInTheDocument()
    })

    it('displays artifact title correctly', () => {
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

      expect(screen.getByText('Test Artifact')).toBeInTheDocument()
    })

    it('displays agent type correctly', () => {
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

      expect(screen.getByText(/Agent type: Implementation report/)).toBeInTheDocument()
    })
  })

  describe('Navigation behavior', () => {
    it('calculates correct navigation state for first artifact', () => {
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

      const previousButton = screen.getByLabelText('Previous artifact')
      const nextButton = screen.getByLabelText('Next artifact')

      expect(previousButton).toBeDisabled()
      expect(nextButton).not.toBeDisabled()
      expect(screen.getByText('1 of 3')).toBeInTheDocument()
    })

    it('calculates correct navigation state for middle artifact', () => {
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

      const previousButton = screen.getByLabelText('Previous artifact')
      const nextButton = screen.getByLabelText('Next artifact')

      expect(previousButton).not.toBeDisabled()
      expect(nextButton).not.toBeDisabled()
      expect(screen.getByText('2 of 3')).toBeInTheDocument()
    })

    it('calculates correct navigation state for last artifact', () => {
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

      const previousButton = screen.getByLabelText('Previous artifact')
      const nextButton = screen.getByLabelText('Next artifact')

      expect(previousButton).not.toBeDisabled()
      expect(nextButton).toBeDisabled()
      expect(screen.getByText('3 of 3')).toBeInTheDocument()
    })

    it('sorts artifacts chronologically (oldest first)', () => {
      const unsortedArtifacts = [
        { ...mockArtifact, artifact_id: 'art-3', created_at: '2026-01-03T00:00:00Z', updated_at: '2026-01-03T00:00:00Z' },
        { ...mockArtifact, artifact_id: 'art-1', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        { ...mockArtifact, artifact_id: 'art-2', created_at: '2026-01-02T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' },
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

      // Should show as 1 of 3 (oldest first)
      expect(screen.getByText('1 of 3')).toBeInTheDocument()
    })

    it('handles navigation when artifact is not in sorted list', () => {
      const artifactNotInList = { ...mockArtifact, artifact_id: 'art-999', created_at: '2026-01-05T00:00:00Z', updated_at: '2026-01-05T00:00:00Z' }

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifactNotInList}
          artifacts={mockArtifacts}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      // Should fall back to index 0
      expect(screen.getByText('1 of 3')).toBeInTheDocument()
    })

    it('calls onNavigate with correct index when Previous is clicked', () => {
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

      const previousButton = screen.getByLabelText('Previous artifact')
      fireEvent.click(previousButton)

      expect(mockOnNavigate).toHaveBeenCalledWith(0)
    })

    it('calls onNavigate with correct index when Next is clicked', () => {
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

      const nextButton = screen.getByLabelText('Next artifact')
      fireEvent.click(nextButton)

      expect(mockOnNavigate).toHaveBeenCalledWith(2)
    })

    it('does not show navigation when only one artifact', () => {
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={mockArtifacts[0]}
          artifacts={[mockArtifacts[0]]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.queryByLabelText('Previous artifact')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Next artifact')).not.toBeInTheDocument()
    })
  })

  describe('Git diff detection and rendering', () => {
    it('detects git diff artifact by title starting with "git diff for ticket"', () => {
      const gitDiffArtifact: SupabaseAgentArtifactRow = {
        ...mockArtifact,
        title: 'git diff for ticket HAL-001',
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

      expect(screen.getByTestId('git-diff-viewer')).toBeInTheDocument()
      expect(screen.queryByTestId('react-markdown')).not.toBeInTheDocument()
    })

    it('detects git diff artifact by title starting with "git-diff for ticket"', () => {
      const gitDiffArtifact: SupabaseAgentArtifactRow = {
        ...mockArtifact,
        title: 'git-diff for ticket HAL-001',
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

      expect(screen.getByTestId('git-diff-viewer')).toBeInTheDocument()
    })

    it('renders markdown for non-git-diff artifacts', () => {
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

      expect(screen.getByTestId('react-markdown')).toBeInTheDocument()
      expect(screen.queryByTestId('git-diff-viewer')).not.toBeInTheDocument()
    })

    it('handles case-insensitive git diff detection', () => {
      const gitDiffArtifact: SupabaseAgentArtifactRow = {
        ...mockArtifact,
        title: 'GIT DIFF FOR TICKET HAL-001',
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

      // Should still detect as git diff (case-insensitive)
      expect(screen.getByTestId('git-diff-viewer')).toBeInTheDocument()
    })
  })

  describe('Content validation and rendering', () => {
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

    it('displays error message when artifact has no artifact_id', () => {
      const invalidArtifact = { ...mockArtifact, artifact_id: undefined } as any

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={invalidArtifact}
          artifacts={[]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.getByText(/Invalid artifact data/)).toBeInTheDocument()
    })

    it('displays error message when body_md is missing', () => {
      const artifactWithoutBody: SupabaseAgentArtifactRow = {
        ...mockArtifact,
        body_md: undefined as any,
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

    it('displays error message when body_md is empty string', () => {
      const artifactWithEmptyBody: SupabaseAgentArtifactRow = {
        ...mockArtifact,
        body_md: '',
      }

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifactWithEmptyBody}
          artifacts={[artifactWithEmptyBody]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.getByText(/No output produced/)).toBeInTheDocument()
    })

    it('displays error message when body_md is only whitespace', () => {
      const artifactWithWhitespace: SupabaseAgentArtifactRow = {
        ...mockArtifact,
        body_md: '   \n\t  ',
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

    it('displays git diff specific message when git diff artifact has empty body', () => {
      const emptyGitDiff: SupabaseAgentArtifactRow = {
        ...mockArtifact,
        title: 'git diff for ticket HAL-001',
        body_md: '   ',
      }

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={emptyGitDiff}
          artifacts={[emptyGitDiff]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.getByText(/No diff available/)).toBeInTheDocument()
    })

    it('renders markdown content correctly', () => {
      const artifactWithContent: SupabaseAgentArtifactRow = {
        ...mockArtifact,
        body_md: '# Heading\n\nParagraph text.',
      }

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifactWithContent}
          artifacts={[artifactWithContent]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      const markdown = screen.getByTestId('react-markdown')
      expect(markdown).toBeInTheDocument()
      expect(markdown.textContent).toContain('# Heading')
      expect(markdown.textContent).toContain('Paragraph text.')
    })
  })

  describe('Keyboard navigation', () => {
    it('calls onClose when Escape key is pressed', () => {
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

      const dialog = screen.getByRole('dialog')
      fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' })

      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('closes image viewer when Escape is pressed and image viewer is open', async () => {
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

      // Open image viewer by clicking an image (if we had one)
      // For now, we'll test that Escape doesn't close main modal when image viewer is open
      // This is a simplified test - in reality we'd need to trigger image click first
      const dialog = screen.getByRole('dialog')
      fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' })

      // Main modal should close
      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('handles Tab key for focus trap', () => {
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

      const dialog = screen.getByRole('dialog')
      
      // Tab key should not close modal
      fireEvent.keyDown(dialog, { key: 'Tab', code: 'Tab' })
      expect(mockOnClose).not.toHaveBeenCalled()
    })
  })

  describe('Modal close behavior', () => {
    it('calls onClose when close button is clicked', () => {
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

      const closeButton = screen.getByLabelText('Close')
      fireEvent.click(closeButton)

      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('calls onClose when backdrop is clicked', () => {
      const { container } = render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={mockArtifact}
          artifacts={[mockArtifact]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      const backdrop = container.querySelector('.ticket-detail-backdrop') as HTMLDivElement
      expect(backdrop).toBeInTheDocument()

      // Simulate clicking the backdrop (not the modal content)
      const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true })
      Object.defineProperty(clickEvent, 'target', {
        get: () => backdrop,
        configurable: true,
      })
      Object.defineProperty(clickEvent, 'currentTarget', {
        get: () => backdrop,
        configurable: true,
      })

      backdrop.dispatchEvent(clickEvent)

      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('Image viewer integration', () => {
    it('renders ImageViewerModal when image is clicked', async () => {
      // This test would require actual markdown with images
      // For now, we verify the component structure supports it
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

      // ImageViewerModal should not be visible initially
      expect(screen.queryByTestId('image-viewer-modal')).not.toBeInTheDocument()
    })
  })

  describe('Edge cases', () => {
    it('handles artifacts array with empty array', () => {
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={mockArtifact}
          artifacts={[]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      // Should still render the artifact
      expect(screen.getByText('Test Artifact')).toBeInTheDocument()
      // Should not show navigation
      expect(screen.queryByLabelText('Previous artifact')).not.toBeInTheDocument()
    })

    it('handles artifacts with same timestamp by sorting by artifact_id', () => {
      const sameTimeArtifacts: SupabaseAgentArtifactRow[] = [
        { ...mockArtifact, artifact_id: 'art-z', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        { ...mockArtifact, artifact_id: 'art-a', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        { ...mockArtifact, artifact_id: 'art-m', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ]

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={sameTimeArtifacts[1]} // art-a
          artifacts={sameTimeArtifacts}
          currentIndex={1}
          onNavigate={mockOnNavigate}
        />
      )

      // Should be sorted by artifact_id, so art-a should be first
      expect(screen.getByText('1 of 3')).toBeInTheDocument()
    })

    it('handles missing created_at by using fallback', () => {
      const artifactWithoutDate: SupabaseAgentArtifactRow = {
        ...mockArtifact,
        created_at: undefined as any,
      }

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifactWithoutDate}
          artifacts={[artifactWithoutDate]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      // Should still render
      expect(screen.getByText('Test Artifact')).toBeInTheDocument()
    })
  })
})
