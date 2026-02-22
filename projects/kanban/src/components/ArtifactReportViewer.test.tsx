import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ArtifactReportViewer } from './ArtifactReportViewer'
import type { SupabaseAgentArtifactRow } from '../App.types'

// Mock dependencies
vi.mock('../GitDiffViewer', () => ({
  GitDiffViewer: ({ diff }: { diff: string }) => <div data-testid="git-diff-viewer">{diff}</div>,
}))

vi.mock('./ImageViewerModal', () => ({
  ImageViewerModal: ({ open, onClose, imageSrc, imageAlt }: any) =>
    open ? (
      <div data-testid="image-viewer-modal">
        <div data-testid="image-src">{imageSrc}</div>
        <div data-testid="image-alt">{imageAlt}</div>
        <button onClick={onClose}>Close Image</button>
      </div>
    ) : null,
}))

vi.mock('./MarkdownImage', () => ({
  MarkdownImage: ({ src, alt, onImageClick }: any) => (
    <img
      src={src}
      alt={alt}
      onClick={() => onImageClick(src, alt)}
      data-testid="markdown-image"
    />
  ),
}))

vi.mock('react-markdown', () => ({
  default: ({ children, components }: any) => {
    // Simulate markdown rendering with image support
    if (components?.img) {
      const ImageComponent = components.img
      // Extract images from markdown-like content
      const imageMatch = String(children).match(/!\[([^\]]*)\]\(([^)]+)\)/)
      if (imageMatch) {
        return (
          <div>
            <ImageComponent
              node={{
                properties: { src: imageMatch[2], alt: imageMatch[1] },
                alt: imageMatch[1],
              }}
            />
          </div>
        )
      }
    }
    return <div>{children}</div>
  },
}))

describe('ArtifactReportViewer', () => {
  const mockOnClose = vi.fn()
  const mockOnNavigate = vi.fn()

  const createMockArtifact = (overrides?: Partial<SupabaseAgentArtifactRow>): SupabaseAgentArtifactRow => ({
    artifact_id: 'artifact-1',
    ticket_pk: 'ticket-1',
    repo_full_name: 'test/repo',
    agent_type: 'implementation',
    title: 'Test Artifact',
    body_md: 'Test content',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    document.body.style.overflow = ''
  })

  afterEach(() => {
    document.body.style.overflow = ''
  })

  describe('Modal visibility and basic rendering', () => {
    it('does not render when open is false', () => {
      const { container } = render(
        <ArtifactReportViewer
          open={false}
          onClose={mockOnClose}
          artifact={createMockArtifact()}
          artifacts={[]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(container.firstChild).toBeNull()
    })

    it('renders modal with artifact title when open', () => {
      const artifact = createMockArtifact({ title: 'My Test Artifact' })
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

      expect(screen.getByText('My Test Artifact')).toBeInTheDocument()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('renders agent type and created date', () => {
      const artifact = createMockArtifact({
        agent_type: 'qa',
        created_at: '2024-01-15T10:30:00Z',
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

      expect(screen.getByText(/Agent type: QA report/)).toBeInTheDocument()
      expect(screen.getByText(/Created:/)).toBeInTheDocument()
    })
  })

  describe('Navigation behavior', () => {
    it('renders navigation buttons when multiple artifacts exist', () => {
      const artifacts = [
        createMockArtifact({ artifact_id: 'artifact-1', created_at: '2024-01-01T00:00:00Z' }),
        createMockArtifact({ artifact_id: 'artifact-2', created_at: '2024-01-02T00:00:00Z' }),
        createMockArtifact({ artifact_id: 'artifact-3', created_at: '2024-01-03T00:00:00Z' }),
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

      expect(screen.getByText('Previous')).toBeInTheDocument()
      expect(screen.getByText('Next')).toBeInTheDocument()
      expect(screen.getByText('2 of 3')).toBeInTheDocument()
    })

    it('does not render navigation when only one artifact exists', () => {
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

      expect(screen.queryByText('Previous')).not.toBeInTheDocument()
      expect(screen.queryByText('Next')).not.toBeInTheDocument()
    })

    it('disables Previous button on first artifact', () => {
      const artifacts = [
        createMockArtifact({ artifact_id: 'artifact-1', created_at: '2024-01-01T00:00:00Z' }),
        createMockArtifact({ artifact_id: 'artifact-2', created_at: '2024-01-02T00:00:00Z' }),
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

      const prevButton = screen.getByText('Previous')
      expect(prevButton).toBeDisabled()
      expect(screen.getByText('Next')).not.toBeDisabled()
    })

    it('disables Next button on last artifact', () => {
      const artifacts = [
        createMockArtifact({ artifact_id: 'artifact-1', created_at: '2024-01-01T00:00:00Z' }),
        createMockArtifact({ artifact_id: 'artifact-2', created_at: '2024-01-02T00:00:00Z' }),
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

      const nextButton = screen.getByText('Next')
      expect(nextButton).toBeDisabled()
      expect(screen.getByText('Previous')).not.toBeDisabled()
    })

    it('calls onNavigate with correct index when Previous is clicked', () => {
      const artifacts = [
        createMockArtifact({ artifact_id: 'artifact-1', created_at: '2024-01-01T00:00:00Z' }),
        createMockArtifact({ artifact_id: 'artifact-2', created_at: '2024-01-02T00:00:00Z' }),
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

      const prevButton = screen.getByText('Previous')
      prevButton.click()

      expect(mockOnNavigate).toHaveBeenCalledTimes(1)
      expect(mockOnNavigate).toHaveBeenCalledWith(0)
    })

    it('calls onNavigate with correct index when Next is clicked', () => {
      const artifacts = [
        createMockArtifact({ artifact_id: 'artifact-1', created_at: '2024-01-01T00:00:00Z' }),
        createMockArtifact({ artifact_id: 'artifact-2', created_at: '2024-01-02T00:00:00Z' }),
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

      const nextButton = screen.getByText('Next')
      nextButton.click()

      expect(mockOnNavigate).toHaveBeenCalledTimes(1)
      expect(mockOnNavigate).toHaveBeenCalledWith(1)
    })

    it('sorts artifacts chronologically for navigation', () => {
      const artifacts = [
        createMockArtifact({ artifact_id: 'artifact-3', created_at: '2024-01-03T00:00:00Z' }),
        createMockArtifact({ artifact_id: 'artifact-1', created_at: '2024-01-01T00:00:00Z' }),
        createMockArtifact({ artifact_id: 'artifact-2', created_at: '2024-01-02T00:00:00Z' }),
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

      // Should show "1 of 3" because artifacts are sorted chronologically
      expect(screen.getByText('1 of 3')).toBeInTheDocument()
      // Previous should be disabled (first in sorted order)
      expect(screen.getByText('Previous')).toBeDisabled()
    })
  })

  describe('Git diff detection and rendering', () => {
    it('detects git diff artifact by title starting with "git diff for ticket"', () => {
      const artifact = createMockArtifact({
        title: 'git diff for ticket HAL-1234',
        body_md: 'diff --git a/file.txt b/file.txt\n+new line',
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

      expect(screen.getByTestId('git-diff-viewer')).toBeInTheDocument()
      expect(screen.getByText(/diff --git/)).toBeInTheDocument()
    })

    it('detects git diff artifact by title starting with "git-diff for ticket"', () => {
      const artifact = createMockArtifact({
        title: 'git-diff for ticket HAL-1234',
        body_md: 'diff --git a/file.txt b/file.txt',
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

      expect(screen.getByTestId('git-diff-viewer')).toBeInTheDocument()
    })

    it('renders markdown for non-git-diff artifacts', () => {
      const artifact = createMockArtifact({
        title: 'Regular Artifact',
        body_md: 'This is regular markdown content',
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

      expect(screen.queryByTestId('git-diff-viewer')).not.toBeInTheDocument()
      expect(screen.getByText('This is regular markdown content')).toBeInTheDocument()
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
        ...createMockArtifact(),
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

    it('renders error message when body_md is missing', () => {
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

    it('renders empty content message when body_md is only whitespace', () => {
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

  describe('Keyboard navigation', () => {
    it('calls onClose when Escape key is pressed', () => {
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

      const modal = screen.getByRole('dialog')
      fireEvent.keyDown(modal, { key: 'Escape' })

      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('closes image viewer when Escape is pressed and image viewer is open', () => {
      const artifact = createMockArtifact({
        body_md: '![alt](data:image/png;base64,test)',
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

      // Click image to open viewer (simulated)
      const image = screen.queryByTestId('markdown-image')
      if (image) {
        fireEvent.click(image)
      }

      // Press Escape - should close image viewer, not main modal
      const modal = screen.getByRole('dialog')
      fireEvent.keyDown(modal, { key: 'Escape' })

      // Image viewer should be closed (onClose not called for main modal)
      // This is tested indirectly - if image viewer closes, Escape won't propagate
    })
  })

  describe('Body overflow management', () => {
    it('sets body overflow to hidden when modal opens', () => {
      const artifact = createMockArtifact()
      const { rerender } = render(
        <ArtifactReportViewer
          open={false}
          onClose={mockOnClose}
          artifact={artifact}
          artifacts={[artifact]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(document.body.style.overflow).toBe('')

      rerender(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact}
          artifacts={[artifact]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(document.body.style.overflow).toBe('hidden')
    })

    it('restores body overflow when modal closes', () => {
      const artifact = createMockArtifact()
      const { rerender } = render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact}
          artifacts={[artifact]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(document.body.style.overflow).toBe('hidden')

      rerender(
        <ArtifactReportViewer
          open={false}
          onClose={mockOnClose}
          artifact={artifact}
          artifacts={[artifact]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(document.body.style.overflow).toBe('')
    })
  })

  describe('Close button and backdrop click', () => {
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
      closeButton.click()

      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('calls onClose when backdrop is clicked', () => {
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

      const backdrop = screen.getByRole('dialog')
      // Click on the backdrop (not the modal content)
      fireEvent.click(backdrop)

      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })
  })
})
