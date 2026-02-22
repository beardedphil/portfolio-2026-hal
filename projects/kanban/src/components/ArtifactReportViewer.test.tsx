import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ArtifactReportViewer } from './ArtifactReportViewer'
import type { SupabaseAgentArtifactRow } from '../App.types'

// Mock dependencies
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}))

vi.mock('../GitDiffViewer', () => ({
  GitDiffViewer: ({ diff }: { diff: string }) => <div data-testid="git-diff">{diff}</div>,
}))

vi.mock('./ImageViewerModal', () => ({
  ImageViewerModal: ({ open, onClose, imageSrc, imageAlt }: any) => 
    open && imageSrc ? (
      <div data-testid="image-viewer-modal">
        <button onClick={onClose}>Close Image</button>
        <img src={imageSrc} alt={imageAlt} />
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
      configurable: true,
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

    it('renders with "Untitled Artifact" when artifact title is missing', () => {
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

    it('displays error message when artifact is invalid (missing artifact_id)', () => {
      const invalidArtifact = { ...createMockArtifact(), artifact_id: '' }
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={invalidArtifact as any}
          artifacts={[]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.getByText(/Invalid artifact data/)).toBeInTheDocument()
    })

    it('displays message when body_md is empty', () => {
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

      expect(screen.getByText(/No output produced/)).toBeInTheDocument()
    })
  })

  describe('Navigation behavior', () => {
    it('renders navigation buttons when multiple artifacts exist', () => {
      const artifacts = [
        createMockArtifact({ artifact_id: 'artifact-1', title: 'Artifact 1' }),
        createMockArtifact({ artifact_id: 'artifact-2', title: 'Artifact 2' }),
        createMockArtifact({ artifact_id: 'artifact-3', title: 'Artifact 3' }),
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

    it('does not render navigation buttons when only one artifact exists', () => {
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

    it('disables Previous button when on first artifact', () => {
      const artifacts = [
        createMockArtifact({ artifact_id: 'artifact-1' }),
        createMockArtifact({ artifact_id: 'artifact-2' }),
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
    })

    it('disables Next button when on last artifact', () => {
      const artifacts = [
        createMockArtifact({ artifact_id: 'artifact-1' }),
        createMockArtifact({ artifact_id: 'artifact-2' }),
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
    })

    it('calls onNavigate with previous index when Previous button is clicked', () => {
      const artifacts = [
        createMockArtifact({ artifact_id: 'artifact-1' }),
        createMockArtifact({ artifact_id: 'artifact-2' }),
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
      fireEvent.click(prevButton)

      expect(mockOnNavigate).toHaveBeenCalledWith(0)
    })

    it('calls onNavigate with next index when Next button is clicked', () => {
      const artifacts = [
        createMockArtifact({ artifact_id: 'artifact-1' }),
        createMockArtifact({ artifact_id: 'artifact-2' }),
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
      fireEvent.click(nextButton)

      expect(mockOnNavigate).toHaveBeenCalledWith(1)
    })

    it('sorts artifacts chronologically for navigation', () => {
      const artifacts = [
        createMockArtifact({ 
          artifact_id: 'artifact-3', 
          created_at: '2024-01-03T00:00:00Z',
          title: 'Third'
        }),
        createMockArtifact({ 
          artifact_id: 'artifact-1', 
          created_at: '2024-01-01T00:00:00Z',
          title: 'First'
        }),
        createMockArtifact({ 
          artifact_id: 'artifact-2', 
          created_at: '2024-01-02T00:00:00Z',
          title: 'Second'
        }),
      ]

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifacts[1]} // Second artifact (by creation date)
          artifacts={artifacts}
          currentIndex={1}
          onNavigate={mockOnNavigate}
        />
      )

      // Should show "2 of 3" because artifacts are sorted chronologically
      expect(screen.getByText('2 of 3')).toBeInTheDocument()
    })
  })

  describe('Keyboard interactions', () => {
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

      const dialog = screen.getByRole('dialog')
      fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' })

      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('closes image viewer when Escape is pressed and image viewer is open', async () => {
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

      // Click on image to open image viewer
      const image = screen.getByTestId('markdown-image')
      fireEvent.click(image)

      await waitFor(() => {
        expect(screen.getByTestId('image-viewer-modal')).toBeInTheDocument()
      })

      // Press Escape - should close image viewer, not main modal
      const dialog = screen.getByRole('dialog')
      fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' })

      await waitFor(() => {
        expect(screen.queryByTestId('image-viewer-modal')).not.toBeInTheDocument()
      })

      // Main modal should still be open
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('calls onClose when backdrop is clicked', () => {
      const artifact = createMockArtifact()
      const { container } = render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact}
          artifacts={[artifact]}
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
      backdrop.dispatchEvent(clickEvent)

      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('does not call onClose when modal content is clicked', () => {
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
      fireEvent.click(modal)

      expect(mockOnClose).not.toHaveBeenCalled()
    })

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

  describe('Git diff rendering', () => {
    it('renders GitDiffViewer for git-diff artifacts', () => {
      const artifact = createMockArtifact({
        title: 'git diff for ticket HAL-123',
        body_md: 'diff --git a/file.ts b/file.ts\n+new line',
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

      expect(screen.getByTestId('git-diff')).toBeInTheDocument()
      expect(screen.getByText('diff --git a/file.ts b/file.ts\n+new line')).toBeInTheDocument()
    })

    it('renders GitDiffViewer for git-diff artifacts with hyphenated title', () => {
      const artifact = createMockArtifact({
        title: 'git-diff for ticket HAL-123',
        body_md: 'diff content',
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

      expect(screen.getByTestId('git-diff')).toBeInTheDocument()
    })

    it('displays appropriate message when git-diff artifact has empty content', () => {
      const artifact = createMockArtifact({
        title: 'git diff for ticket HAL-123',
        body_md: '',
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

      expect(screen.getByText(/No diff available/)).toBeInTheDocument()
    })
  })

  describe('Image handling', () => {
    it('opens image viewer when markdown image is clicked', async () => {
      const artifact = createMockArtifact({
        body_md: '![Test Image](data:image/png;base64,test)',
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

      const image = screen.getByTestId('markdown-image')
      fireEvent.click(image)

      await waitFor(() => {
        expect(screen.getByTestId('image-viewer-modal')).toBeInTheDocument()
      })
    })

    it('closes image viewer when modal closes', async () => {
      const artifact = createMockArtifact({
        body_md: '![Test Image](data:image/png;base64,test)',
      })

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

      // Open image viewer
      const image = screen.getByTestId('markdown-image')
      fireEvent.click(image)

      await waitFor(() => {
        expect(screen.getByTestId('image-viewer-modal')).toBeInTheDocument()
      })

      // Close main modal
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

      await waitFor(() => {
        expect(screen.queryByTestId('image-viewer-modal')).not.toBeInTheDocument()
      })
    })
  })

  describe('Body overflow management', () => {
    it('sets body overflow to hidden when modal opens', () => {
      const artifact = createMockArtifact()
      const originalOverflow = document.body.style.overflow

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

      expect(document.body.style.overflow).toBe('hidden')
      
      // Cleanup
      document.body.style.overflow = originalOverflow
    })

    it('restores body overflow when modal closes', () => {
      const artifact = createMockArtifact()
      document.body.style.overflow = 'scroll'

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

      expect(document.body.style.overflow).toBe('scroll')
    })
  })

  describe('Focus management', () => {
    it('focuses close button when modal opens', async () => {
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

      await waitFor(() => {
        const closeButton = screen.getByLabelText('Close')
        expect(closeButton).toHaveFocus()
      })
    })
  })

  describe('Agent type display', () => {
    it('displays correct agent type for implementation artifacts', () => {
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

      expect(screen.getByText(/Agent type: Implementation/)).toBeInTheDocument()
    })

    it('displays correct agent type for QA artifacts', () => {
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

      expect(screen.getByText(/Agent type: QA/)).toBeInTheDocument()
    })

    it('displays created date in locale string format', () => {
      const artifact = createMockArtifact({ 
        created_at: '2024-01-15T10:30:00Z' 
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

      // The date should be displayed in locale string format
      const dateText = screen.getByText(/Created:/)
      expect(dateText).toBeInTheDocument()
    })
  })
})
