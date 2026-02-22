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
        <div>{imageAlt}</div>
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
  default: ({ children }: { children: string }) => <div data-testid="react-markdown">{children}</div>,
}))

describe('ArtifactReportViewer', () => {
  const mockOnClose = vi.fn()
  const mockOnNavigate = vi.fn()

  const createArtifact = (
    id: string,
    title: string,
    body: string,
    createdAt: string,
    agentType: SupabaseAgentArtifactRow['agent_type'] = 'implementation'
  ): SupabaseAgentArtifactRow => ({
    artifact_id: id,
    ticket_pk: 'ticket-1',
    repo_full_name: 'test/repo',
    agent_type: agentType,
    title,
    body_md: body,
    created_at: createdAt,
    updated_at: createdAt,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock document.body.style.overflow
    Object.defineProperty(document.body, 'style', {
      value: { overflow: '' },
      writable: true,
    })
  })

  describe('Modal visibility and basic rendering', () => {
    it('does not render when open is false', () => {
      const artifact = createArtifact('1', 'Test Artifact', 'Content', '2024-01-01T00:00:00Z')
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

    it('renders artifact title and content when open', () => {
      const artifact = createArtifact('1', 'Test Artifact', 'Test content', '2024-01-01T00:00:00Z')
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

      expect(screen.getByText('Test Artifact')).toBeInTheDocument()
      expect(screen.getByTestId('react-markdown')).toHaveTextContent('Test content')
    })

    it('displays agent type correctly', () => {
      const artifact = createArtifact('1', 'Test', 'Content', '2024-01-01T00:00:00Z', 'qa')
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

  describe('Navigation behavior', () => {
    it('sorts artifacts chronologically and enables navigation', () => {
      const artifact1 = createArtifact('1', 'First', 'Content 1', '2024-01-01T00:00:00Z')
      const artifact2 = createArtifact('2', 'Second', 'Content 2', '2024-01-02T00:00:00Z')
      const artifact3 = createArtifact('3', 'Third', 'Content 3', '2024-01-03T00:00:00Z')
      const artifacts = [artifact3, artifact1, artifact2] // Unsorted

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact2}
          artifacts={artifacts}
          currentIndex={1}
          onNavigate={mockOnNavigate}
        />
      )

      // Should show "2 of 3" (second artifact in sorted order)
      expect(screen.getByText(/2 of 3/)).toBeInTheDocument()
      
      const prevButton = screen.getByLabelText('Previous artifact')
      const nextButton = screen.getByLabelText('Next artifact')
      
      expect(prevButton).not.toBeDisabled()
      expect(nextButton).not.toBeDisabled()
    })

    it('disables Previous button on first artifact', () => {
      const artifact1 = createArtifact('1', 'First', 'Content 1', '2024-01-01T00:00:00Z')
      const artifact2 = createArtifact('2', 'Second', 'Content 2', '2024-01-02T00:00:00Z')
      const artifacts = [artifact1, artifact2]

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact1}
          artifacts={artifacts}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      const prevButton = screen.getByLabelText('Previous artifact')
      const nextButton = screen.getByLabelText('Next artifact')
      
      expect(prevButton).toBeDisabled()
      expect(nextButton).not.toBeDisabled()
    })

    it('disables Next button on last artifact', () => {
      const artifact1 = createArtifact('1', 'First', 'Content 1', '2024-01-01T00:00:00Z')
      const artifact2 = createArtifact('2', 'Second', 'Content 2', '2024-01-02T00:00:00Z')
      const artifacts = [artifact1, artifact2]

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact2}
          artifacts={artifacts}
          currentIndex={1}
          onNavigate={mockOnNavigate}
        />
      )

      const prevButton = screen.getByLabelText('Previous artifact')
      const nextButton = screen.getByLabelText('Next artifact')
      
      expect(prevButton).not.toBeDisabled()
      expect(nextButton).toBeDisabled()
    })

    it('calls onNavigate with correct index when Previous is clicked', () => {
      const artifact1 = createArtifact('1', 'First', 'Content 1', '2024-01-01T00:00:00Z')
      const artifact2 = createArtifact('2', 'Second', 'Content 2', '2024-01-02T00:00:00Z')
      const artifacts = [artifact1, artifact2]

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact2}
          artifacts={artifacts}
          currentIndex={1}
          onNavigate={mockOnNavigate}
        />
      )

      const prevButton = screen.getByLabelText('Previous artifact')
      fireEvent.click(prevButton)

      expect(mockOnNavigate).toHaveBeenCalledWith(0)
    })

    it('calls onNavigate with correct index when Next is clicked', () => {
      const artifact1 = createArtifact('1', 'First', 'Content 1', '2024-01-01T00:00:00Z')
      const artifact2 = createArtifact('2', 'Second', 'Content 2', '2024-01-02T00:00:00Z')
      const artifacts = [artifact1, artifact2]

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact1}
          artifacts={artifacts}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      const nextButton = screen.getByLabelText('Next artifact')
      fireEvent.click(nextButton)

      expect(mockOnNavigate).toHaveBeenCalledWith(1)
    })

    it('hides navigation when only one artifact exists', () => {
      const artifact = createArtifact('1', 'Test', 'Content', '2024-01-01T00:00:00Z')
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
  })

  describe('Keyboard navigation', () => {
    it('calls onClose when Escape key is pressed', () => {
      const artifact = createArtifact('1', 'Test', 'Content', '2024-01-01T00:00:00Z')
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
      const artifact = createArtifact('1', 'Test', '![alt](data:image/png;base64,test)', '2024-01-01T00:00:00Z')
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

      // Click image to open viewer
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
      expect(mockOnClose).not.toHaveBeenCalled()
    })
  })

  describe('Git diff detection and rendering', () => {
    it('detects git diff artifact by title starting with "git diff for ticket"', () => {
      const artifact = createArtifact(
        '1',
        'git diff for ticket HAL-001',
        'diff content',
        '2024-01-01T00:00:00Z'
      )
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
      expect(screen.getByTestId('git-diff-viewer')).toHaveTextContent('diff content')
    })

    it('detects git diff artifact by title starting with "git-diff for ticket"', () => {
      const artifact = createArtifact(
        '1',
        'git-diff for ticket HAL-001',
        'diff content',
        '2024-01-01T00:00:00Z'
      )
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
      const artifact = createArtifact('1', 'Regular Artifact', 'Markdown content', '2024-01-01T00:00:00Z')
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

  describe('Image click handling', () => {
    it('opens image viewer when image is clicked', async () => {
      const artifact = createArtifact('1', 'Test', '![alt text](data:image/png;base64,test)', '2024-01-01T00:00:00Z')
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

    it('closes image viewer when close button is clicked', async () => {
      const artifact = createArtifact('1', 'Test', '![alt](data:image/png;base64,test)', '2024-01-01T00:00:00Z')
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
      const image = screen.getByTestId('markdown-image')
      fireEvent.click(image)

      await waitFor(() => {
        expect(screen.getByTestId('image-viewer-modal')).toBeInTheDocument()
      })

      // Close image viewer
      const closeButton = screen.getByText('Close Image')
      fireEvent.click(closeButton)

      await waitFor(() => {
        expect(screen.queryByTestId('image-viewer-modal')).not.toBeInTheDocument()
      })
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
        ...createArtifact('1', 'Test', 'Content', '2024-01-01T00:00:00Z'),
        artifact_id: '',
      }
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

    it('displays message when artifact has no body_md', () => {
      const artifact = createArtifact('1', 'Test', '', '2024-01-01T00:00:00Z')
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

    it('displays git diff specific message when git diff artifact has no content', () => {
      const artifact = createArtifact('1', 'git diff for ticket HAL-001', '', '2024-01-01T00:00:00Z')
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

  describe('Close button and backdrop click', () => {
    it('calls onClose when close button is clicked', () => {
      const artifact = createArtifact('1', 'Test', 'Content', '2024-01-01T00:00:00Z')
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
      const artifact = createArtifact('1', 'Test', 'Content', '2024-01-01T00:00:00Z')
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

      // Simulate click on backdrop (target === currentTarget)
      const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true })
      Object.defineProperty(clickEvent, 'target', {
        get: () => backdrop,
        configurable: true,
      })
      backdrop.dispatchEvent(clickEvent)

      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })
  })
})
