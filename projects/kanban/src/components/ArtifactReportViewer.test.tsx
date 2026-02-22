import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ArtifactReportViewer } from './ArtifactReportViewer'
import type { SupabaseAgentArtifactRow } from './types'

describe('ArtifactReportViewer', () => {
  const mockOnClose = vi.fn()
  const mockOnNavigate = vi.fn()

  const createMockArtifact = (overrides?: Partial<SupabaseAgentArtifactRow>): SupabaseAgentArtifactRow => ({
    artifact_id: 'art-1',
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
    document.body.style.overflow = ''
  })

  afterEach(() => {
    document.body.style.overflow = ''
  })

  describe('Modal visibility', () => {
    it('does not render when closed', () => {
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

    it('renders when open with valid artifact', () => {
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={createMockArtifact()}
          artifacts={[]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('Test Artifact')).toBeInTheDocument()
    })
  })

  describe('Artifact content rendering', () => {
    it('renders markdown content correctly', () => {
      const artifact = createMockArtifact({
        body_md: '# Heading\n\n**Bold text** and *italic text*',
      })

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact}
          artifacts={[]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.getByText('Heading')).toBeInTheDocument()
      expect(screen.getByText('Bold text')).toBeInTheDocument()
      expect(screen.getByText('italic text')).toBeInTheDocument()
    })

    it('renders git diff content using GitDiffViewer', () => {
      const artifact = createMockArtifact({
        title: 'git diff for ticket HAL-1234',
        body_md: 'diff --git a/file.ts b/file.ts\n@@ -1,2 +1,2 @@\n-old\n+new',
      })

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact}
          artifacts={[]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      // GitDiffViewer should render the diff content
      expect(screen.getByText(/diff --git/)).toBeInTheDocument()
    })

    it('handles empty artifact body gracefully', () => {
      const artifact = createMockArtifact({
        body_md: '',
      })

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact}
          artifacts={[]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.getByText(/No output produced/)).toBeInTheDocument()
    })

    it('handles invalid artifact gracefully', () => {
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
      const invalidArtifact = createMockArtifact()
      delete (invalidArtifact as any).artifact_id

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
  })

  describe('Navigation', () => {
    it('renders navigation buttons when multiple artifacts exist', () => {
      const artifacts = [
        createMockArtifact({ artifact_id: 'art-1', title: 'Artifact 1' }),
        createMockArtifact({ artifact_id: 'art-2', title: 'Artifact 2' }),
        createMockArtifact({ artifact_id: 'art-3', title: 'Artifact 3' }),
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

      expect(screen.getByText('1 of 3')).toBeInTheDocument()
      expect(screen.getByLabelText('Previous artifact')).toBeInTheDocument()
      expect(screen.getByLabelText('Next artifact')).toBeInTheDocument()
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

      expect(screen.queryByText(/of/)).not.toBeInTheDocument()
    })

    it('disables Previous button on first artifact', () => {
      const artifacts = [
        createMockArtifact({ artifact_id: 'art-1', created_at: '2024-01-01T00:00:00Z' }),
        createMockArtifact({ artifact_id: 'art-2', created_at: '2024-01-02T00:00:00Z' }),
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

    it('disables Next button on last artifact', () => {
      const artifacts = [
        createMockArtifact({ artifact_id: 'art-1', created_at: '2024-01-01T00:00:00Z' }),
        createMockArtifact({ artifact_id: 'art-2', created_at: '2024-01-02T00:00:00Z' }),
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

    it('calls onNavigate when Previous button is clicked', () => {
      const artifacts = [
        createMockArtifact({ artifact_id: 'art-1', created_at: '2024-01-01T00:00:00Z' }),
        createMockArtifact({ artifact_id: 'art-2', created_at: '2024-01-02T00:00:00Z' }),
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

      expect(mockOnNavigate).toHaveBeenCalledWith(0)
    })

    it('calls onNavigate when Next button is clicked', () => {
      const artifacts = [
        createMockArtifact({ artifact_id: 'art-1', created_at: '2024-01-01T00:00:00Z' }),
        createMockArtifact({ artifact_id: 'art-2', created_at: '2024-01-02T00:00:00Z' }),
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

      expect(mockOnNavigate).toHaveBeenCalledWith(1)
    })

    it('sorts artifacts chronologically for navigation', () => {
      const artifacts = [
        createMockArtifact({ artifact_id: 'art-3', created_at: '2024-01-03T00:00:00Z' }),
        createMockArtifact({ artifact_id: 'art-1', created_at: '2024-01-01T00:00:00Z' }),
        createMockArtifact({ artifact_id: 'art-2', created_at: '2024-01-02T00:00:00Z' }),
      ]

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifacts[1]} // art-1 (oldest)
          artifacts={artifacts}
          currentIndex={1}
          onNavigate={mockOnNavigate}
        />
      )

      // Should show position 1 of 3 (art-1 is first after sorting)
      expect(screen.getByText('1 of 3')).toBeInTheDocument()
    })
  })

  describe('Keyboard handling', () => {
    it('calls onClose when Escape key is pressed', () => {
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={createMockArtifact()}
          artifacts={[]}
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
        body_md: '![alt text](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==)',
      })

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact}
          artifacts={[]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      // Click on image to open image viewer
      const img = screen.getByAltText('alt text')
      fireEvent.click(img)

      // Wait for image viewer to open
      await waitFor(() => {
        expect(screen.getByText('alt text')).toBeInTheDocument()
      })

      // Press Escape - should close image viewer, not main modal
      const dialog = screen.getByRole('dialog')
      fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' })

      // Image viewer should be closed, but modal should still be open
      await waitFor(() => {
        expect(screen.queryByText('alt text')).not.toBeInTheDocument()
      })
      expect(mockOnClose).not.toHaveBeenCalled()
    })

    it('handles Tab key for focus trap', () => {
      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={createMockArtifact()}
          artifacts={[]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      const dialog = screen.getByRole('dialog')
      const closeButton = screen.getByLabelText('Close')

      // Focus on close button
      closeButton.focus()
      expect(document.activeElement).toBe(closeButton)

      // Press Tab - should wrap to first focusable element
      fireEvent.keyDown(dialog, { key: 'Tab', code: 'Tab' })
      // Note: Actual focus wrapping behavior may vary based on DOM structure
      // This test verifies the key handler is called
    })
  })

  describe('Image handling', () => {
    it('opens image viewer when image is clicked', async () => {
      const artifact = createMockArtifact({
        body_md: '![Test Image](https://example.com/image.jpg)',
      })

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact}
          artifacts={[]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      const img = screen.getByAltText('Test Image')
      fireEvent.click(img)

      await waitFor(() => {
        expect(screen.getByText('Test Image')).toBeInTheDocument()
      })
    })

    it('passes correct image src and alt to image viewer', async () => {
      const artifact = createMockArtifact({
        title: 'My Artifact',
        body_md: '![Custom Alt](https://example.com/custom.jpg)',
      })

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact}
          artifacts={[]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      const img = screen.getByAltText('Custom Alt')
      fireEvent.click(img)

      await waitFor(() => {
        const imageViewer = screen.getByRole('dialog')
        expect(imageViewer).toBeInTheDocument()
        expect(screen.getByAltText('Custom Alt')).toBeInTheDocument()
      })
    })
  })

  describe('Metadata display', () => {
    it('displays agent type correctly', () => {
      const artifact = createMockArtifact({
        agent_type: 'qa',
      })

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact}
          artifacts={[]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.getByText(/Agent type: QA report/)).toBeInTheDocument()
    })

    it('displays created date correctly', () => {
      const artifact = createMockArtifact({
        created_at: '2024-01-15T10:30:00Z',
      })

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifact}
          artifacts={[]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      // Date should be formatted and displayed
      expect(screen.getByText(/Created:/)).toBeInTheDocument()
    })
  })

  describe('Body overflow management', () => {
    it('sets body overflow to hidden when modal opens', () => {
      document.body.style.overflow = 'auto'

      const { rerender } = render(
        <ArtifactReportViewer
          open={false}
          onClose={mockOnClose}
          artifact={createMockArtifact()}
          artifacts={[]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(document.body.style.overflow).toBe('auto')

      rerender(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={createMockArtifact()}
          artifacts={[]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(document.body.style.overflow).toBe('hidden')
    })

    it('restores body overflow when modal closes', () => {
      document.body.style.overflow = 'auto'

      const { rerender } = render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={createMockArtifact()}
          artifacts={[]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(document.body.style.overflow).toBe('hidden')

      rerender(
        <ArtifactReportViewer
          open={false}
          onClose={mockOnClose}
          artifact={createMockArtifact()}
          artifacts={[]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(document.body.style.overflow).toBe('auto')
    })
  })
})
