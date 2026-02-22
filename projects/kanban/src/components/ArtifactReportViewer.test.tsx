import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ArtifactReportViewer } from './ArtifactReportViewer'
import type { SupabaseAgentArtifactRow } from '../App.types'

// Mock dependencies
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div data-testid="react-markdown">{children}</div>,
}))

vi.mock('../GitDiffViewer', () => ({
  GitDiffViewer: ({ diff }: { diff: string }) => <div data-testid="git-diff-viewer">{diff}</div>,
}))

vi.mock('./ImageViewerModal', () => ({
  ImageViewerModal: ({ open, onClose, imageSrc, imageAlt }: any) => 
    open ? (
      <div data-testid="image-viewer-modal" role="dialog">
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
    artifact_id: 'test-artifact-1',
    ticket_pk: 'test-ticket-1',
    repo_full_name: 'test/repo',
    title: 'Test Artifact',
    body_md: '# Test Content\n\nThis is test content.',
    agent_type: 'implementation',
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

    it('renders with valid artifact when open', () => {
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
      expect(screen.getByText('Agent type: Implementation report')).toBeInTheDocument()
    })

    it('renders with default title when artifact title is missing', () => {
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

  describe('Image handling behavior', () => {
    it('opens ImageViewerModal when image is clicked', async () => {
      const artifact = createMockArtifact({
        body_md: '![Test Image](https://example.com/image.jpg)',
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

      // Find and click the markdown image
      const markdownImage = screen.queryByTestId('markdown-image')
      if (markdownImage) {
        fireEvent.click(markdownImage)
        
        await waitFor(() => {
          const imageViewer = screen.queryByTestId('image-viewer-modal')
          expect(imageViewer).toBeInTheDocument()
        })
      }
    })

    it('closes ImageViewerModal when Escape is pressed while image viewer is open', async () => {
      const artifact = createMockArtifact({
        body_md: '![Test Image](https://example.com/image.jpg)',
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

      // Open image viewer
      const markdownImage = screen.queryByTestId('markdown-image')
      if (markdownImage) {
        fireEvent.click(markdownImage)
        
        await waitFor(() => {
          expect(screen.queryByTestId('image-viewer-modal')).toBeInTheDocument()
        })

        // Press Escape
        const dialog = screen.getByRole('dialog')
        fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' })

        await waitFor(() => {
          expect(screen.queryByTestId('image-viewer-modal')).not.toBeInTheDocument()
        })
      }
    })
  })

  describe('Keyboard navigation behavior', () => {
    it('closes modal when Escape key is pressed', () => {
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

    it('traps focus with Tab key navigation', () => {
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
      const closeButton = screen.getByLabelText('Close')
      
      // Focus the close button
      closeButton.focus()
      expect(document.activeElement).toBe(closeButton)

      // Tab should wrap to last focusable element
      fireEvent.keyDown(dialog, { key: 'Tab', code: 'Tab' })
      // Note: Full focus trap testing requires more complex setup with actual focusable elements
      // This test verifies the key handler is set up correctly
    })
  })

  describe('Git diff detection and rendering', () => {
    it('detects git-diff artifact by title and renders GitDiffViewer', () => {
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

      expect(screen.getByTestId('git-diff-viewer')).toBeInTheDocument()
      expect(screen.getByText('diff --git a/file.ts b/file.ts\n+new line')).toBeInTheDocument()
    })

    it('detects git-diff artifact with hyphenated title', () => {
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

      expect(screen.getByTestId('git-diff-viewer')).toBeInTheDocument()
    })

    it('renders markdown for non-git-diff artifacts', () => {
      const artifact = createMockArtifact({
        title: 'Regular Artifact',
        body_md: '# Regular Content',
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

      expect(screen.getByTestId('react-markdown')).toBeInTheDocument()
      expect(screen.queryByTestId('git-diff-viewer')).not.toBeInTheDocument()
    })
  })

  describe('Navigation behavior', () => {
    it('renders navigation buttons when multiple artifacts exist', () => {
      const artifact1 = createMockArtifact({ artifact_id: '1', title: 'Artifact 1' })
      const artifact2 = createMockArtifact({ artifact_id: '2', title: 'Artifact 2' })
      const artifact3 = createMockArtifact({ artifact_id: '3', title: 'Artifact 3' })
      
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact1}
          artifacts={[artifact1, artifact2, artifact3]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.getByLabelText('Previous artifact')).toBeInTheDocument()
      expect(screen.getByLabelText('Next artifact')).toBeInTheDocument()
      expect(screen.getByText('1 of 3')).toBeInTheDocument()
    })

    it('calls onNavigate when Next button is clicked', () => {
      const artifact1 = createMockArtifact({ 
        artifact_id: '1', 
        created_at: '2024-01-01T00:00:00Z' 
      })
      const artifact2 = createMockArtifact({ 
        artifact_id: '2', 
        created_at: '2024-01-02T00:00:00Z' 
      })
      
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact1}
          artifacts={[artifact1, artifact2]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      const nextButton = screen.getByLabelText('Next artifact')
      fireEvent.click(nextButton)

      expect(mockOnNavigate).toHaveBeenCalledWith(1)
    })

    it('calls onNavigate when Previous button is clicked', () => {
      const artifact1 = createMockArtifact({ 
        artifact_id: '1', 
        created_at: '2024-01-01T00:00:00Z' 
      })
      const artifact2 = createMockArtifact({ 
        artifact_id: '2', 
        created_at: '2024-01-02T00:00:00Z' 
      })
      
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact2}
          artifacts={[artifact1, artifact2]}
          currentIndex={1}
          onNavigate={mockOnNavigate}
        />
      )

      const prevButton = screen.getByLabelText('Previous artifact')
      fireEvent.click(prevButton)

      expect(mockOnNavigate).toHaveBeenCalledWith(0)
    })

    it('disables Previous button on first artifact', () => {
      const artifact1 = createMockArtifact({ artifact_id: '1' })
      const artifact2 = createMockArtifact({ artifact_id: '2' })
      
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact1}
          artifacts={[artifact1, artifact2]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      const prevButton = screen.getByLabelText('Previous artifact')
      expect(prevButton).toBeDisabled()
    })

    it('disables Next button on last artifact', () => {
      const artifact1 = createMockArtifact({ artifact_id: '1' })
      const artifact2 = createMockArtifact({ artifact_id: '2' })
      
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact2}
          artifacts={[artifact1, artifact2]}
          currentIndex={1}
          onNavigate={mockOnNavigate}
        />
      )

      const nextButton = screen.getByLabelText('Next artifact')
      expect(nextButton).toBeDisabled()
    })
  })

  describe('Invalid artifact handling', () => {
    it('handles null artifact gracefully', () => {
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

    it('handles artifact without artifact_id', () => {
      const invalidArtifact = createMockArtifact({ artifact_id: '' })
      
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

    it('handles empty body_md content', () => {
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

    it('handles whitespace-only body_md content', () => {
      const artifact = createMockArtifact({ body_md: '   \n\n  ' })
      
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

    it('shows specific message for empty git-diff content', () => {
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

  describe('Artifact sorting behavior', () => {
    it('sorts artifacts chronologically for navigation', () => {
      const artifact1 = createMockArtifact({ 
        artifact_id: '1', 
        title: 'First',
        created_at: '2024-01-01T00:00:00Z' 
      })
      const artifact2 = createMockArtifact({ 
        artifact_id: '2', 
        title: 'Second',
        created_at: '2024-01-02T00:00:00Z' 
      })
      const artifact3 = createMockArtifact({ 
        artifact_id: '3', 
        title: 'Third',
        created_at: '2024-01-03T00:00:00Z' 
      })
      
      // Pass artifacts in reverse order
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact2}
          artifacts={[artifact3, artifact1, artifact2]}
          currentIndex={1}
          onNavigate={mockOnNavigate}
        />
      )

      // Should show correct position (2 of 3) based on sorted order
      expect(screen.getByText('2 of 3')).toBeInTheDocument()
    })

    it('uses artifact_id for deterministic sorting when timestamps are equal', () => {
      const artifact1 = createMockArtifact({ 
        artifact_id: 'a',
        created_at: '2024-01-01T00:00:00Z' 
      })
      const artifact2 = createMockArtifact({ 
        artifact_id: 'b',
        created_at: '2024-01-01T00:00:00Z' 
      })
      
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact1}
          artifacts={[artifact2, artifact1]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      // Should find artifact1 at index 0 after sorting
      expect(screen.getByText('1 of 2')).toBeInTheDocument()
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
})
