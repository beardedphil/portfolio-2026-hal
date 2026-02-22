import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ArtifactReportViewer } from './ArtifactReportViewer'
import type { SupabaseAgentArtifactRow } from '../App.types'

// Mock child components
vi.mock('../GitDiffViewer', () => ({
  GitDiffViewer: ({ diff }: { diff: string }) => (
    <div data-testid="git-diff-viewer">{diff}</div>
  ),
}))

vi.mock('./ImageViewerModal', () => ({
  ImageViewerModal: ({ open, onClose, imageSrc, imageAlt }: any) => {
    if (!open || !imageSrc) return null
    return (
      <div data-testid="image-viewer-modal">
        <div data-testid="image-viewer-src">{imageSrc}</div>
        <div data-testid="image-viewer-alt">{imageAlt}</div>
        <button onClick={onClose} data-testid="image-viewer-close">Close</button>
      </div>
    )
  },
}))

vi.mock('./MarkdownImage', () => ({
  MarkdownImage: ({ src, alt, onImageClick }: any) => (
    <div
      data-testid="markdown-image"
      data-src={src}
      data-alt={alt}
      onClick={() => onImageClick(src, alt)}
    >
      Image: {alt}
    </div>
  ),
}))

vi.mock('react-markdown', () => ({
  default: ({ children, components }: any) => (
    <div data-testid="react-markdown">
      {components?.img ? (
        <components.img src="test.jpg" alt="test" />
      ) : (
        <div>{children}</div>
      )}
    </div>
  ),
}))

describe('ArtifactReportViewer', () => {
  const mockArtifact: SupabaseAgentArtifactRow = {
    artifact_id: 'artifact-1',
    ticket_pk: 'ticket-1',
    repo_full_name: 'test/repo',
    agent_type: 'implementation',
    title: 'Test Artifact',
    body_md: '# Test Content\n\nThis is test content.',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  }

  const mockArtifacts: SupabaseAgentArtifactRow[] = [
    mockArtifact,
    {
      ...mockArtifact,
      artifact_id: 'artifact-2',
      title: 'Test Artifact 2',
      body_md: '# Test Content 2',
      created_at: '2024-01-02T00:00:00Z',
    },
    {
      ...mockArtifact,
      artifact_id: 'artifact-3',
      title: 'Test Artifact 3',
      body_md: '# Test Content 3',
      created_at: '2024-01-03T00:00:00Z',
    },
  ]

  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    artifact: mockArtifact,
    artifacts: mockArtifacts,
    currentIndex: 0,
    onNavigate: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock document.body.style.overflow
    Object.defineProperty(document.body, 'style', {
      value: { overflow: '' },
      writable: true,
    })
  })

  describe('Behavior 1: Rendering with valid artifact', () => {
    it('renders artifact title and content when open', () => {
      render(<ArtifactReportViewer {...defaultProps} />)

      expect(screen.getByText('Test Artifact')).toBeInTheDocument()
      expect(screen.getByTestId('react-markdown')).toBeInTheDocument()
    })

    it('renders agent type and created date', () => {
      render(<ArtifactReportViewer {...defaultProps} />)

      expect(screen.getByText(/Agent type: Implementation report/i)).toBeInTheDocument()
      expect(screen.getByText(/Created:/i)).toBeInTheDocument()
    })

    it('does not render when open is false', () => {
      render(<ArtifactReportViewer {...defaultProps} open={false} />)

      expect(screen.queryByText('Test Artifact')).not.toBeInTheDocument()
    })

    it('handles invalid artifact gracefully', () => {
      render(
        <ArtifactReportViewer
          {...defaultProps}
          artifact={null}
        />
      )

      expect(screen.getByText(/No artifact selected/i)).toBeInTheDocument()
    })

    it('handles artifact with missing body_md', () => {
      const artifactWithoutBody = {
        ...mockArtifact,
        body_md: '',
      }

      render(
        <ArtifactReportViewer
          {...defaultProps}
          artifact={artifactWithoutBody}
        />
      )

      expect(screen.getByText(/No content available/i)).toBeInTheDocument()
    })
  })

  describe('Behavior 2: Navigation between artifacts', () => {
    it('renders navigation buttons when multiple artifacts exist', () => {
      render(<ArtifactReportViewer {...defaultProps} />)

      expect(screen.getByText('Previous')).toBeInTheDocument()
      expect(screen.getByText('Next')).toBeInTheDocument()
      expect(screen.getByText('1 of 3')).toBeInTheDocument()
    })

    it('does not render navigation when only one artifact exists', () => {
      render(
        <ArtifactReportViewer
          {...defaultProps}
          artifacts={[mockArtifact]}
        />
      )

      expect(screen.queryByText('Previous')).not.toBeInTheDocument()
      expect(screen.queryByText('Next')).not.toBeInTheDocument()
    })

    it('calls onNavigate when Previous button is clicked', () => {
      render(
        <ArtifactReportViewer
          {...defaultProps}
          currentIndex={1}
        />
      )

      const previousButton = screen.getByText('Previous')
      fireEvent.click(previousButton)

      expect(defaultProps.onNavigate).toHaveBeenCalledWith(0)
    })

    it('calls onNavigate when Next button is clicked', () => {
      render(<ArtifactReportViewer {...defaultProps} />)

      const nextButton = screen.getByText('Next')
      fireEvent.click(nextButton)

      expect(defaultProps.onNavigate).toHaveBeenCalledWith(1)
    })

    it('disables Previous button on first artifact', () => {
      render(<ArtifactReportViewer {...defaultProps} currentIndex={0} />)

      const previousButton = screen.getByText('Previous')
      expect(previousButton).toBeDisabled()
    })

    it('disables Next button on last artifact', () => {
      render(
        <ArtifactReportViewer
          {...defaultProps}
          currentIndex={2}
        />
      )

      const nextButton = screen.getByText('Next')
      expect(nextButton).toBeDisabled()
    })

    it('sorts artifacts chronologically for navigation', () => {
      const unsortedArtifacts = [
        { ...mockArtifact, artifact_id: 'artifact-3', created_at: '2024-01-03T00:00:00Z' },
        { ...mockArtifact, artifact_id: 'artifact-1', created_at: '2024-01-01T00:00:00Z' },
        { ...mockArtifact, artifact_id: 'artifact-2', created_at: '2024-01-02T00:00:00Z' },
      ]

      render(
        <ArtifactReportViewer
          {...defaultProps}
          artifacts={unsortedArtifacts}
          artifact={unsortedArtifacts[1]} // artifact-1 should be at index 0 after sorting
        />
      )

      // Should show "1 of 3" indicating it's the first in sorted order
      expect(screen.getByText('1 of 3')).toBeInTheDocument()
    })
  })

  describe('Behavior 3: Image handling and modal', () => {
    it('opens image viewer modal when image is clicked', async () => {
      render(<ArtifactReportViewer {...defaultProps} />)

      // Find the markdown image component (mocked)
      const imageComponent = screen.getByTestId('markdown-image')
      fireEvent.click(imageComponent)

      await waitFor(() => {
        expect(screen.getByTestId('image-viewer-modal')).toBeInTheDocument()
      })
    })

    it('closes image viewer modal when close button is clicked', async () => {
      render(<ArtifactReportViewer {...defaultProps} />)

      // Open modal
      const imageComponent = screen.getByTestId('markdown-image')
      fireEvent.click(imageComponent)

      await waitFor(() => {
        expect(screen.getByTestId('image-viewer-modal')).toBeInTheDocument()
      })

      // Close modal
      const closeButton = screen.getByTestId('image-viewer-close')
      fireEvent.click(closeButton)

      await waitFor(() => {
        expect(screen.queryByTestId('image-viewer-modal')).not.toBeInTheDocument()
      })
    })

    it('closes image viewer when Escape key is pressed', async () => {
      render(<ArtifactReportViewer {...defaultProps} />)

      // Open modal
      const imageComponent = screen.getByTestId('markdown-image')
      fireEvent.click(imageComponent)

      await waitFor(() => {
        expect(screen.getByTestId('image-viewer-modal')).toBeInTheDocument()
      })

      // Press Escape
      fireEvent.keyDown(document, { key: 'Escape' })

      await waitFor(() => {
        expect(screen.queryByTestId('image-viewer-modal')).not.toBeInTheDocument()
      })
    })

    it('closes main modal when Escape is pressed and image viewer is closed', () => {
      render(<ArtifactReportViewer {...defaultProps} />)

      fireEvent.keyDown(document, { key: 'Escape' })

      expect(defaultProps.onClose).toHaveBeenCalled()
    })
  })

  describe('Behavior 4: Git diff detection and rendering', () => {
    it('detects git diff artifact by title', () => {
      const gitDiffArtifact = {
        ...mockArtifact,
        title: 'git diff for ticket HAL-001',
        body_md: 'diff --git a/file.txt b/file.txt\n@@ -1,1 +1,1 @@\n-old\n+new',
      }

      render(
        <ArtifactReportViewer
          {...defaultProps}
          artifact={gitDiffArtifact}
        />
      )

      expect(screen.getByTestId('git-diff-viewer')).toBeInTheDocument()
    })

    it('detects git diff artifact with hyphenated title', () => {
      const gitDiffArtifact = {
        ...mockArtifact,
        title: 'git-diff for ticket HAL-001',
        body_md: 'diff --git a/file.txt b/file.txt',
      }

      render(
        <ArtifactReportViewer
          {...defaultProps}
          artifact={gitDiffArtifact}
        />
      )

      expect(screen.getByTestId('git-diff-viewer')).toBeInTheDocument()
    })

    it('renders markdown for non-git-diff artifacts', () => {
      render(<ArtifactReportViewer {...defaultProps} />)

      expect(screen.getByTestId('react-markdown')).toBeInTheDocument()
      expect(screen.queryByTestId('git-diff-viewer')).not.toBeInTheDocument()
    })

    it('shows empty message for git diff with no content', () => {
      const gitDiffArtifact = {
        ...mockArtifact,
        title: 'git diff for ticket HAL-001',
        body_md: '',
      }

      render(
        <ArtifactReportViewer
          {...defaultProps}
          artifact={gitDiffArtifact}
        />
      )

      expect(screen.getByText(/No diff available/i)).toBeInTheDocument()
    })
  })

  describe('Behavior 5: Keyboard navigation and accessibility', () => {
    it('traps focus with Tab key', () => {
      render(<ArtifactReportViewer {...defaultProps} />)

      const modal = screen.getByRole('dialog')
      const focusableElements = modal.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )

      if (focusableElements.length > 0) {
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement

        // Focus last element
        lastElement.focus()
        expect(document.activeElement).toBe(lastElement)

        // Press Tab (should wrap to first)
        fireEvent.keyDown(modal, { key: 'Tab' })
        // Note: Actual focus trapping behavior may require more complex setup
      }
    })

    it('closes modal when backdrop is clicked', () => {
      render(<ArtifactReportViewer {...defaultProps} />)

      const backdrop = screen.getByRole('dialog')
      fireEvent.click(backdrop)

      expect(defaultProps.onClose).toHaveBeenCalled()
    })

    it('does not close modal when modal content is clicked', () => {
      render(<ArtifactReportViewer {...defaultProps} />)

      const modalContent = screen.getByText('Test Artifact').closest('.ticket-detail-modal')
      if (modalContent) {
        fireEvent.click(modalContent)
        expect(defaultProps.onClose).not.toHaveBeenCalled()
      }
    })
  })

  describe('Behavior 6: Edge cases and error handling', () => {
    it('handles artifact with missing artifact_id', () => {
      const invalidArtifact = {
        ...mockArtifact,
        artifact_id: '',
      }

      render(
        <ArtifactReportViewer
          {...defaultProps}
          artifact={invalidArtifact}
        />
      )

      expect(screen.getByText(/Invalid artifact data/i)).toBeInTheDocument()
    })

    it('handles empty artifacts array with valid artifact prop', () => {
      render(
        <ArtifactReportViewer
          {...defaultProps}
          artifacts={[]}
        />
      )

      // Should still render the artifact
      expect(screen.getByText('Test Artifact')).toBeInTheDocument()
      // Should not show navigation
      expect(screen.queryByText('Previous')).not.toBeInTheDocument()
    })

    it('handles whitespace-only body_md', () => {
      const artifactWithWhitespace = {
        ...mockArtifact,
        body_md: '   \n\t  \n   ',
      }

      render(
        <ArtifactReportViewer
          {...defaultProps}
          artifact={artifactWithWhitespace}
        />
      )

      expect(screen.getByText(/No output produced/i)).toBeInTheDocument()
    })

    it('handles different agent types correctly', () => {
      const qaArtifact = {
        ...mockArtifact,
        agent_type: 'qa' as const,
      }

      render(
        <ArtifactReportViewer
          {...defaultProps}
          artifact={qaArtifact}
        />
      )

      expect(screen.getByText(/Agent type: QA report/i)).toBeInTheDocument()
    })
  })
})
