import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ImageViewerModal } from './ImageViewerModal'

describe('ImageViewerModal', () => {
  const mockImageSrc = 'https://example.com/image.jpg'
  const mockImageAlt = 'Test image'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not render when closed', () => {
    const mockOnClose = vi.fn()
    const { container } = render(
      <ImageViewerModal
        open={false}
        onClose={mockOnClose}
        imageSrc={mockImageSrc}
        imageAlt={mockImageAlt}
      />
    )

    expect(container.firstChild).toBeNull()
  })

  it('does not render when imageSrc is null', () => {
    const mockOnClose = vi.fn()
    const { container } = render(
      <ImageViewerModal
        open={true}
        onClose={mockOnClose}
        imageSrc={null}
        imageAlt={mockImageAlt}
      />
    )

    expect(container.firstChild).toBeNull()
  })

  it('renders when open and imageSrc is provided', () => {
    const mockOnClose = vi.fn()
    render(
      <ImageViewerModal
        open={true}
        onClose={mockOnClose}
        imageSrc={mockImageSrc}
        imageAlt={mockImageAlt}
      />
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(mockImageAlt)).toBeInTheDocument()
    expect(screen.getByAltText(mockImageAlt)).toBeInTheDocument()
  })

  it('calls onClose when Escape key is pressed', () => {
    const mockOnClose = vi.fn()
    render(
      <ImageViewerModal
        open={true}
        onClose={mockOnClose}
        imageSrc={mockImageSrc}
        imageAlt={mockImageAlt}
      />
    )

    const dialog = screen.getByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' })

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when other keys are pressed', () => {
    const mockOnClose = vi.fn()
    render(
      <ImageViewerModal
        open={true}
        onClose={mockOnClose}
        imageSrc={mockImageSrc}
        imageAlt={mockImageAlt}
      />
    )

    const dialog = screen.getByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'Enter', code: 'Enter' })
    fireEvent.keyDown(dialog, { key: ' ', code: 'Space' })

    expect(mockOnClose).not.toHaveBeenCalled()
  })

  it('calls onClose when backdrop is clicked', () => {
    const mockOnClose = vi.fn()
    const { container } = render(
      <ImageViewerModal
        open={true}
        onClose={mockOnClose}
        imageSrc={mockImageSrc}
        imageAlt={mockImageAlt}
      />
    )

    // Get the backdrop element (the dialog with class ticket-detail-backdrop)
    const backdrop = container.querySelector('.ticket-detail-backdrop') as HTMLDivElement
    expect(backdrop).toBeInTheDocument()
    
    // The component's onClick handler checks: e.target === e.currentTarget
    // To test this, we need to create an event where target === currentTarget
    // We'll use a workaround: create a synthetic event and manually set both target and currentTarget
    const syntheticEvent = {
      target: backdrop,
      currentTarget: backdrop,
      type: 'click',
      bubbles: true,
      cancelable: true,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      nativeEvent: new MouseEvent('click', { bubbles: true }),
    } as unknown as React.MouseEvent<HTMLDivElement>
    
    // Manually trigger the onClick handler by accessing it through React's event system
    // Since we can't easily access React's synthetic event handlers, we'll use a different approach:
    // Create a click event and ensure it bubbles, then check if onClose was called
    // when clicking on the backdrop (not on children)
    const clickEvent = new MouseEvent('click', { 
      bubbles: true, 
      cancelable: true,
    })
    
    // Use Object.defineProperty to make target === currentTarget for this specific event
    // This is a workaround for testing React's synthetic events
    Object.defineProperty(clickEvent, 'target', {
      get: () => backdrop,
      configurable: true,
    })
    
    backdrop.dispatchEvent(clickEvent)
    
    // Verify onClose was called when clicking the backdrop
    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when modal content is clicked', () => {
    const mockOnClose = vi.fn()
    render(
      <ImageViewerModal
        open={true}
        onClose={mockOnClose}
        imageSrc={mockImageSrc}
        imageAlt={mockImageAlt}
      />
    )

    const image = screen.getByAltText(mockImageAlt)
    fireEvent.click(image)

    expect(mockOnClose).not.toHaveBeenCalled()
  })

  it('calls onClose when close button is clicked', () => {
    const mockOnClose = vi.fn()
    render(
      <ImageViewerModal
        open={true}
        onClose={mockOnClose}
        imageSrc={mockImageSrc}
        imageAlt={mockImageAlt}
      />
    )

    const closeButton = screen.getByLabelText('Close')
    fireEvent.click(closeButton)

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('renders with default alt text when imageAlt is empty', () => {
    const mockOnClose = vi.fn()
    render(
      <ImageViewerModal
        open={true}
        onClose={mockOnClose}
        imageSrc={mockImageSrc}
        imageAlt=""
      />
    )

    // The h2 title should show "Image" when imageAlt is empty
    expect(screen.getByText('Image')).toBeInTheDocument()
    // The img alt attribute will be empty string, so we check it exists with empty alt
    const img = screen.getByRole('img', { hidden: true })
    expect(img).toHaveAttribute('alt', '')
  })
})
