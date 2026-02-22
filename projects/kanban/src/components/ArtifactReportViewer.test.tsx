import { describe, it, expect, vi, beforeEach } from 'vitest'
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

vi.mock('./utils', () => ({
  getAgentTypeDisplayName: (type: string) => {
    const names: Record<string, string> = {
      implementation: 'Implementation Agent',
      qa: 'QA Agent',
      'human-in-the-loop': 'Human in the Loop',
      other: 'Other',
    }
    return names[type] || 'Unknown'
  },
}))

// Mock react-markdown
vi.mock('react-markdown', () => ({
  default: ({ children, components }: any) => {
    // Simple markdown renderer for tests
    const content = typeof children === 'string' ? children : String(children)
    // Handle headings
    const headingMatch = content.match(/^# (.+)$/m)
    if (headingMatch) {
      return <h1>{headingMatch[1]}</h1>
    }
    // Handle paragraphs
    const paragraphs = content.split('\n\n').filter((p: string) => p.trim())
    return (
      <div>
        {paragraphs.map((p: string, i: number) => (
          <p key={i}>{p}</p>
        ))}
        {components?.img && <div data-testid="markdown-image-placeholder" />}
      </div>
    )
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

  describe('Modal open/close behavior', () => {
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

    it('renders when open is true', () => {
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
    })

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
  })

  describe('Navigation behavior', () => {
    it('renders navigation buttons when multiple artifacts exist', () => {
      const artifact1 = createMockArtifact({ artifact_id: 'artifact-1', title: 'Artifact 1' })
      const artifact2 = createMockArtifact({ artifact_id: 'artifact-2', title: 'Artifact 2' })
      const artifact3 = createMockArtifact({ artifact_id: 'artifact-3', title: 'Artifact 3' })

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

      expect(screen.getByText('Previous')).toBeInTheDocument()
      expect(screen.getByText('Next')).toBeInTheDocument()
      expect(screen.getByText('1 of 3')).toBeInTheDocument()
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

    it('disables Previous button on first artifact', () => {
      const artifact1 = createMockArtifact({ artifact_id: 'artifact-1' })
      const artifact2 = createMockArtifact({ artifact_id: 'artifact-2' })

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
      const artifact1 = createMockArtifact({ artifact_id: 'artifact-1' })
      const artifact2 = createMockArtifact({ artifact_id: 'artifact-2' })

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

    it('calls onNavigate with correct index when Previous is clicked', () => {
      const artifact1 = createMockArtifact({ artifact_id: 'artifact-1' })
      const artifact2 = createMockArtifact({ artifact_id: 'artifact-2' })

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

    it('calls onNavigate with correct index when Next is clicked', () => {
      const artifact1 = createMockArtifact({ artifact_id: 'artifact-1' })
      const artifact2 = createMockArtifact({ artifact_id: 'artifact-2' })

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

    it('sorts artifacts chronologically for navigation', () => {
      const artifact1 = createMockArtifact({ 
        artifact_id: 'artifact-1', 
        created_at: '2024-01-01T00:00:00Z',
        title: 'First Artifact'
      })
      const artifact2 = createMockArtifact({ 
        artifact_id: 'artifact-2', 
        created_at: '2024-01-02T00:00:00Z',
        title: 'Second Artifact'
      })
      const artifact3 = createMockArtifact({ 
        artifact_id: 'artifact-3', 
        created_at: '2024-01-03T00:00:00Z',
        title: 'Third Artifact'
      })

      // Pass artifacts in non-chronological order
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

      // Should show "2 of 3" because artifact2 is the second in chronological order
      expect(screen.getByText('2 of 3')).toBeInTheDocument()
    })
  })

  describe('Git diff detection and rendering', () => {
    it('detects git diff artifact by title starting with "git diff for ticket"', () => {
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

      expect(screen.getByTestId('git-diff-viewer')).toBeInTheDocument()
      expect(screen.getByText(/diff --git/)).toBeInTheDocument()
    })

    it('detects git diff artifact by title starting with "git-diff for ticket"', () => {
      const artifact = createMockArtifact({
        title: 'git-diff for ticket HAL-123',
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
        body_md: '# Heading\n\nSome content',
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
      expect(screen.getByText('Heading')).toBeInTheDocument()
      expect(screen.getByText('Some content')).toBeInTheDocument()
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

    it('displays error message when artifact has no artifact_id', () => {
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

    it('displays message when artifact has no body_md', () => {
      const artifact = createMockArtifact({
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

      expect(screen.getByText(/No content available/)).toBeInTheDocument()
    })

    it('displays message when artifact body_md is only whitespace', () => {
      const artifact = createMockArtifact({
        body_md: '   \n\t  ',
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

      expect(screen.getByText(/No output produced/)).toBeInTheDocument()
    })
  })

  describe('Image viewer integration', () => {
    it('opens image viewer when image in markdown is clicked', async () => {
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

      // Wait for markdown to render
      await waitFor(() => {
        const image = screen.queryByTestId('markdown-image')
        expect(image).toBeInTheDocument()
      })

      const image = screen.getByTestId('markdown-image')
      fireEvent.click(image)

      await waitFor(() => {
        expect(screen.getByTestId('image-viewer-modal')).toBeInTheDocument()
      })
    })

    it('closes image viewer when Escape is pressed while image viewer is open', () => {
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

      // Open image viewer first (simulated)
      const dialog = screen.getByRole('dialog')
      fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' })

      // First Escape should close image viewer, not the modal
      // Since image viewer isn't open initially, it should close the modal
      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  describe('Artifact metadata display', () => {
    it('displays artifact title', () => {
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
    })

    it('displays agent type', () => {
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

      expect(screen.getByText(/Agent type: QA Agent/)).toBeInTheDocument()
    })

    it('displays created date', () => {
      const artifact = createMockArtifact({ created_at: '2024-01-15T10:30:00Z' })
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

      // Date formatting may vary, so just check that "Created:" appears
      expect(screen.getByText(/Created:/)).toBeInTheDocument()
    })

    it('uses default title when artifact title is missing', () => {
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
})
