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
    body_md: 'Test content',
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

  describe('Modal visibility', () => {
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

    it('renders when open is true and artifact is provided', () => {
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

  describe('Navigation behavior', () => {
    it('displays correct artifact index and total count', () => {
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

      const prevButton = screen.getByLabelText('Previous artifact')
      expect(prevButton).toBeDisabled()
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

      const nextButton = screen.getByLabelText('Next artifact')
      expect(nextButton).toBeDisabled()
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

      const prevButton = screen.getByLabelText('Previous artifact')
      fireEvent.click(prevButton)

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

      const nextButton = screen.getByLabelText('Next artifact')
      fireEvent.click(nextButton)

      expect(mockOnNavigate).toHaveBeenCalledWith(1)
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
          artifact={artifacts[1]}
          artifacts={artifacts}
          currentIndex={1}
          onNavigate={mockOnNavigate}
        />
      )

      // Should show "1 of 3" because artifacts are sorted chronologically
      expect(screen.getByText('1 of 3')).toBeInTheDocument()
    })

    it('hides navigation when only one artifact', () => {
      const artifacts = [createMockArtifact()]

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

      expect(screen.queryByLabelText('Previous artifact')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Next artifact')).not.toBeInTheDocument()
    })
  })

  describe('Git-diff detection and rendering', () => {
    it('detects git-diff artifact by title starting with "git diff for ticket"', () => {
      const gitDiffArtifact = createMockArtifact({
        title: 'git diff for ticket HAL-0123',
        body_md: 'diff --git a/file.ts b/file.ts\n@@ -1,1 +1,2 @@\n+new line',
      })

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={gitDiffArtifact}
          artifacts={[]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      // GitDiffViewer should be rendered (we can check by looking for diff content)
      expect(screen.getByText(/diff --git/)).toBeInTheDocument()
    })

    it('detects git-diff artifact by title starting with "git-diff for ticket"', () => {
      const gitDiffArtifact = createMockArtifact({
        title: 'git-diff for ticket HAL-0123',
        body_md: 'diff --git a/file.ts b/file.ts',
      })

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={gitDiffArtifact}
          artifacts={[]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.getByText(/diff --git/)).toBeInTheDocument()
    })

    it('renders markdown for non-git-diff artifacts', () => {
      const markdownArtifact = createMockArtifact({
        title: 'Regular Artifact',
        body_md: '# Heading\n\nThis is **bold** text.',
      })

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={markdownArtifact}
          artifacts={[]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.getByText('Heading')).toBeInTheDocument()
      expect(screen.getByText(/This is/)).toBeInTheDocument()
    })
  })

  describe('Image handling', () => {
    it('renders markdown with image support', () => {
      const artifactWithImage = createMockArtifact({
        body_md: '![Test Image](https://example.com/image.jpg)',
      })

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifactWithImage}
          artifacts={[]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      // MarkdownImage component should render the image
      const img = screen.getByAltText('Test Image')
      expect(img).toBeInTheDocument()
      expect(img).toHaveAttribute('src', 'https://example.com/image.jpg')
    })

    it('opens ImageViewerModal when image is clicked', async () => {
      const artifactWithImage = createMockArtifact({
        body_md: '![Test Image](https://example.com/image.jpg)',
      })

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifactWithImage}
          artifacts={[]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      const img = screen.getByAltText('Test Image')
      fireEvent.click(img)

      await waitFor(() => {
        // ImageViewerModal should be rendered
        expect(screen.getByRole('dialog', { name: /Test Image/i })).toBeInTheDocument()
      })
    })
  })

  describe('Keyboard navigation', () => {
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
      const artifactWithImage = createMockArtifact({
        body_md: '![Test Image](https://example.com/image.jpg)',
      })

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifactWithImage}
          artifacts={[]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      const img = screen.getByAltText('Test Image')
      fireEvent.click(img)

      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: /Test Image/i })).toBeInTheDocument()
      })

      const imageDialog = screen.getByRole('dialog', { name: /Test Image/i })
      fireEvent.keyDown(imageDialog, { key: 'Escape', code: 'Escape' })

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: /Test Image/i })).not.toBeInTheDocument()
      })

      // Main artifact viewer should still be open
      expect(screen.getByText('Test Artifact')).toBeInTheDocument()
    })

    it('calls onClose when close button is clicked', () => {
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

      const closeButton = screen.getByLabelText('Close')
      fireEvent.click(closeButton)

      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('Empty and invalid artifact handling', () => {
    it('displays message when artifact is null', () => {
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

    it('displays message when artifact has no body_md', () => {
      const artifactWithoutBody = createMockArtifact({
        body_md: '',
      })

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifactWithoutBody}
          artifacts={[]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.getByText(/No content available/)).toBeInTheDocument()
    })

    it('displays message when artifact body_md is only whitespace', () => {
      const artifactWithWhitespace = createMockArtifact({
        body_md: '   \n\t  ',
      })

      render(
        <ArtifactReportViewer
          open={true}
          onClose={mockOnClose}
          artifact={artifactWithWhitespace}
          artifacts={[]}
          currentIndex={0}
          onNavigate={mockOnNavigate}
        />
      )

      expect(screen.getByText(/No output produced/)).toBeInTheDocument()
    })
  })

  describe('Body overflow management', () => {
    it('sets body overflow to hidden when modal opens', () => {
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

      expect(document.body.style.overflow).toBe('')

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

      expect(document.body.style.overflow).toBe('')
    })
  })
})
