import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ArtifactReportViewer } from './ArtifactReportViewer'
import type { SupabaseAgentArtifactRow } from '../App.types'

// Mock dependencies
vi.mock('../GitDiffViewer', () => ({
  GitDiffViewer: ({ diff }: { diff: string }) => <div data-testid="git-diff-viewer">{diff}</div>,
}))

vi.mock('react-markdown', () => ({
  default: ({ children, components }: { children: string; components: any }) => {
    // Simple mock that renders markdown content
    // In real usage, react-markdown would process the markdown and call components.img for images
    return <div data-testid="react-markdown">{children}</div>
  },
}))

vi.mock('./ImageViewerModal', () => ({
  ImageViewerModal: ({ open, onClose, imageSrc, imageAlt }: any) => {
    if (!open) return null
    return (
      <div data-testid="image-viewer-modal" role="dialog">
        <button onClick={onClose}>Close Image Viewer</button>
        <img src={imageSrc} alt={imageAlt} />
      </div>
    )
  },
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

  describe('Early return behavior', () => {
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
  })

  describe('Rendering with valid artifact', () => {
    it('renders artifact title and content when open with valid artifact', () => {
      const artifact = createMockArtifact({
        title: 'My Test Artifact',
        body_md: '# Test Content\n\nThis is test content.',
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

      expect(screen.getByText('My Test Artifact')).toBeInTheDocument()
      expect(screen.getByTestId('react-markdown')).toBeInTheDocument()
      // The mock renders the children as-is, so check for the markdown content
      expect(screen.getByText(/# Test Content/)).toBeInTheDocument()
    })

    it('displays agent type and created date', () => {
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

  describe('Handling invalid artifacts', () => {
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

    it('handles artifact without artifact_id gracefully', () => {
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

    it('handles empty body_md gracefully', () => {
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

      // Empty string body_md shows "No content available" (checked before trim)
      expect(screen.getByText(/No content available/)).toBeInTheDocument()
    })

    it('handles whitespace-only body_md gracefully', () => {
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

      expect(screen.getByTestId('git-diff-viewer')).toBeInTheDocument()
      expect(screen.queryByTestId('react-markdown')).not.toBeInTheDocument()
    })

    it('renders GitDiffViewer for git-diff artifacts with hyphenated title', () => {
      const artifact = createMockArtifact({
        title: 'git-diff for ticket HAL-123',
        body_md: 'diff --git a/file.ts b/file.ts',
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

    it('shows appropriate message for empty git diff', () => {
      const artifact = createMockArtifact({
        title: 'git diff for ticket HAL-123',
        body_md: '   ', // Whitespace-only to trigger trimmed check
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

  describe('Image viewer integration', () => {
    it('closes artifact viewer when Escape is pressed and image viewer is closed', () => {
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
      fireEvent.keyDown(dialog, { key: 'Escape' })

      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('renders markdown content with image components', () => {
      const artifact = createMockArtifact({
        body_md: '![alt text](https://example.com/image.jpg)',
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

      // Markdown should be rendered
      expect(screen.getByTestId('react-markdown')).toBeInTheDocument()
    })
  })

  describe('Keyboard navigation', () => {
    it('traps focus with Tab key', async () => {
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

      const dialog = container.querySelector('.ticket-detail-modal') as HTMLElement
      const focusableElements = dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      // Focus last element
      lastElement.focus()
      expect(document.activeElement).toBe(lastElement)

      // Press Tab (without Shift)
      fireEvent.keyDown(dialog, { key: 'Tab' })

      // Focus should wrap to first element
      await waitFor(() => {
        expect(document.activeElement).toBe(firstElement)
      })
    })

    it('traps focus with Shift+Tab key', async () => {
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

      const dialog = container.querySelector('.ticket-detail-modal') as HTMLElement
      const focusableElements = dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      // Focus first element
      firstElement.focus()
      expect(document.activeElement).toBe(firstElement)

      // Press Shift+Tab
      fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })

      // Focus should wrap to last element
      await waitFor(() => {
        expect(document.activeElement).toBe(lastElement)
      })
    })
  })

  describe('Navigation buttons', () => {
    it('renders navigation buttons when multiple artifacts exist', () => {
      const artifact1 = createMockArtifact({ artifact_id: 'artifact-1', created_at: '2024-01-01T00:00:00Z' })
      const artifact2 = createMockArtifact({ artifact_id: 'artifact-2', created_at: '2024-01-02T00:00:00Z' })
      const artifact3 = createMockArtifact({ artifact_id: 'artifact-3', created_at: '2024-01-03T00:00:00Z' })

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact2}
          artifacts={[artifact1, artifact2, artifact3]}
          currentIndex={1}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.getByText('2 of 3')).toBeInTheDocument()
      expect(screen.getByLabelText('Previous artifact')).toBeInTheDocument()
      expect(screen.getByLabelText('Next artifact')).toBeInTheDocument()
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

      expect(screen.queryByLabelText('Previous artifact')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Next artifact')).not.toBeInTheDocument()
    })

    it('calls onNavigate when Previous button is clicked', () => {
      const artifact1 = createMockArtifact({ artifact_id: 'artifact-1', created_at: '2024-01-01T00:00:00Z' })
      const artifact2 = createMockArtifact({ artifact_id: 'artifact-2', created_at: '2024-01-02T00:00:00Z' })

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

      const previousButton = screen.getByLabelText('Previous artifact')
      fireEvent.click(previousButton)

      expect(mockOnNavigate).toHaveBeenCalledWith(0)
    })

    it('calls onNavigate when Next button is clicked', () => {
      const artifact1 = createMockArtifact({ artifact_id: 'artifact-1', created_at: '2024-01-01T00:00:00Z' })
      const artifact2 = createMockArtifact({ artifact_id: 'artifact-2', created_at: '2024-01-02T00:00:00Z' })

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

    it('disables Previous button on first artifact', () => {
      const artifact1 = createMockArtifact({ artifact_id: 'artifact-1', created_at: '2024-01-01T00:00:00Z' })
      const artifact2 = createMockArtifact({ artifact_id: 'artifact-2', created_at: '2024-01-02T00:00:00Z' })

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

      const previousButton = screen.getByLabelText('Previous artifact')
      expect(previousButton).toBeDisabled()
    })

    it('disables Next button on last artifact', () => {
      const artifact1 = createMockArtifact({ artifact_id: 'artifact-1', created_at: '2024-01-01T00:00:00Z' })
      const artifact2 = createMockArtifact({ artifact_id: 'artifact-2', created_at: '2024-01-02T00:00:00Z' })

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

  describe('Artifact sorting', () => {
    it('sorts artifacts chronologically (oldest first)', () => {
      const artifact1 = createMockArtifact({ artifact_id: 'artifact-1', created_at: '2024-01-03T00:00:00Z' })
      const artifact2 = createMockArtifact({ artifact_id: 'artifact-2', created_at: '2024-01-01T00:00:00Z' })
      const artifact3 = createMockArtifact({ artifact_id: 'artifact-3', created_at: '2024-01-02T00:00:00Z' })

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact2}
          artifacts={[artifact1, artifact2, artifact3]}
          currentIndex={1}
          onNavigate={mockOnNavigate}
        />
      )

      // Should show "1 of 3" because artifact2 is the oldest (sorted first)
      expect(screen.getByText('1 of 3')).toBeInTheDocument()
    })

    it('uses artifact_id as secondary sort when timestamps are equal', () => {
      const sameTime = '2024-01-01T00:00:00Z'
      const artifact1 = createMockArtifact({ artifact_id: 'artifact-c', created_at: sameTime })
      const artifact2 = createMockArtifact({ artifact_id: 'artifact-a', created_at: sameTime })
      const artifact3 = createMockArtifact({ artifact_id: 'artifact-b', created_at: sameTime })

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact2}
          artifacts={[artifact1, artifact2, artifact3]}
          currentIndex={1}
          onNavigate={mockOnNavigate}
        />
      )

      // Should be sorted by artifact_id: a, b, c
      // artifact2 (artifact-a) should be at index 0
      expect(screen.getByText('1 of 3')).toBeInTheDocument()
    })
  })

  describe('Backdrop click behavior', () => {
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

      const backdrop = container.querySelector('.ticket-detail-backdrop') as HTMLElement
      expect(backdrop).toBeInTheDocument()

      // Create a click event where target === currentTarget
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      })

      Object.defineProperty(clickEvent, 'target', {
        get: () => backdrop,
        configurable: true,
      })

      backdrop.dispatchEvent(clickEvent)

      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('does not call onClose when modal content is clicked', () => {
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

      // Click on the modal content (not the backdrop)
      const modalContent = container.querySelector('.ticket-detail-modal') as HTMLElement
      expect(modalContent).toBeInTheDocument()
      
      // Create a click event where target is the modal content (not backdrop)
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      })
      
      Object.defineProperty(clickEvent, 'target', {
        get: () => modalContent,
        configurable: true,
      })
      
      // Dispatch on backdrop - but target is modal content, so should not close
      const backdrop = container.querySelector('.ticket-detail-backdrop') as HTMLElement
      backdrop.dispatchEvent(clickEvent)

      // onClose should not be called because target !== currentTarget
      expect(mockOnClose).not.toHaveBeenCalled()
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

    it('restores body overflow when component unmounts', () => {
      const artifact = createMockArtifact()

      const { unmount } = render(
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

      // Unmount the component - cleanup should restore overflow
      unmount()

      // Cleanup should restore the previous overflow value (empty string in test)
      expect(document.body.style.overflow).toBe('')
    })
  })
})
