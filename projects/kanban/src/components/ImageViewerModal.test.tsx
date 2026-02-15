import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImageViewerModal } from './ImageViewerModal'

describe('ImageViewerModal', () => {
  let mockOnClose: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockOnClose = vi.fn()
  })

  it('does not render when open is false', () => {
    const { container } = render(
      <ImageViewerModal
        open={false}
        onClose={mockOnClose}
        imageSrc="https://example.com/image.jpg"
        imageAlt="Test image"
      />
    )

    expect(container.firstChild).toBeNull()
  })

  it('does not render when imageSrc is null', () => {
    const { container } = render(
      <ImageViewerModal
        open={true}
        onClose={mockOnClose}
        imageSrc={null}
        imageAlt="Test image"
      />
    )

    expect(container.firstChild).toBeNull()
  })

  it('renders when open is true and imageSrc is provided', () => {
    render(
      <ImageViewerModal
        open={true}
        onClose={mockOnClose}
        imageSrc="https://example.com/image.jpg"
        imageAlt="Test image"
      />
    )

    expect(screen.getByText('Test image')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Close')).toBeInTheDocument()
  })

  it('calls onClose when Escape key is pressed', async () => {
    const user = userEvent.setup()
    render(
      <ImageViewerModal
        open={true}
        onClose={mockOnClose}
        imageSrc="https://example.com/image.jpg"
        imageAlt="Test image"
      />
    )

    await user.keyboard('{Escape}')
    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when backdrop is clicked', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <ImageViewerModal
        open={true}
        onClose={mockOnClose}
        imageSrc="https://example.com/image.jpg"
        imageAlt="Test image"
      />
    )

    const backdrop = container.querySelector('.ticket-detail-backdrop')
    expect(backdrop).toBeInTheDocument()
    
    if (backdrop) {
      await user.click(backdrop)
      expect(mockOnClose).toHaveBeenCalledTimes(1)
    }
  })

  it('does not call onClose when modal content is clicked', async () => {
    const user = userEvent.setup()
    render(
      <ImageViewerModal
        open={true}
        onClose={mockOnClose}
        imageSrc="https://example.com/image.jpg"
        imageAlt="Test image"
      />
    )

    const modal = screen.getByRole('dialog')
    const modalContent = modal.querySelector('.ticket-detail-modal')
    expect(modalContent).toBeInTheDocument()
    
    if (modalContent) {
      await user.click(modalContent)
      expect(mockOnClose).not.toHaveBeenCalled()
    }
  })

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup()
    render(
      <ImageViewerModal
        open={true}
        onClose={mockOnClose}
        imageSrc="https://example.com/image.jpg"
        imageAlt="Test image"
      />
    )

    const closeButton = screen.getByLabelText('Close')
    await user.click(closeButton)
    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('renders image with correct src and alt', () => {
    render(
      <ImageViewerModal
        open={true}
        onClose={mockOnClose}
        imageSrc="https://example.com/test-image.jpg"
        imageAlt="My test image"
      />
    )

    const img = screen.getByAltText('My test image')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', 'https://example.com/test-image.jpg')
  })

  it('uses default alt text when imageAlt is empty', () => {
    render(
      <ImageViewerModal
        open={true}
        onClose={mockOnClose}
        imageSrc="https://example.com/image.jpg"
        imageAlt=""
      />
    )

    expect(screen.getByText('Image')).toBeInTheDocument()
  })
})
