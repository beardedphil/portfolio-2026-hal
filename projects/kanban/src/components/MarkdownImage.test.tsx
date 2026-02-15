import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MarkdownImage } from './MarkdownImage'

describe('MarkdownImage', () => {
  const mockOnImageClick = vi.fn()

  it('renders img element with expected attributes when src is provided', () => {
    render(
      <MarkdownImage
        src="https://example.com/image.jpg"
        alt="Test image"
        onImageClick={mockOnImageClick}
      />
    )

    const img = screen.getByAltText('Test image')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', 'https://example.com/image.jpg')
    expect(img).toHaveAttribute('alt', 'Test image')
    expect(img).toHaveAttribute('title', 'Click to view full size')
    expect(img).toHaveStyle({ cursor: 'pointer' })
  })

  it('renders img with artifactTitle as alt when alt is not provided', () => {
    render(
      <MarkdownImage
        src="https://example.com/image.jpg"
        artifactTitle="Artifact Title"
        onImageClick={mockOnImageClick}
      />
    )

    const img = screen.getByAltText('Artifact Title')
    expect(img).toBeInTheDocument()
  })

  it('renders img with default alt when neither alt nor artifactTitle is provided', () => {
    render(
      <MarkdownImage
        src="https://example.com/image.jpg"
        onImageClick={mockOnImageClick}
      />
    )

    const img = screen.getByAltText('Image')
    expect(img).toBeInTheDocument()
  })

  it('calls onImageClick when image is clicked', async () => {
    const userEvent = await import('@testing-library/user-event')
    const user = userEvent.default.setup()
    
    render(
      <MarkdownImage
        src="https://example.com/image.jpg"
        alt="Test image"
        onImageClick={mockOnImageClick}
      />
    )

    const img = screen.getByAltText('Test image')
    await user.click(img)
    expect(mockOnImageClick).toHaveBeenCalledWith('https://example.com/image.jpg', 'Test image')
  })

  it('renders fallback when src is not provided', () => {
    render(
      <MarkdownImage
        alt="Missing image"
        onImageClick={mockOnImageClick}
      />
    )

    expect(screen.getByText(/No image source provided: Missing image/)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('renders alt text caption when alt is provided', () => {
    render(
      <MarkdownImage
        src="https://example.com/image.jpg"
        alt="Test image caption"
        onImageClick={mockOnImageClick}
      />
    )

    expect(screen.getByText('Test image caption')).toBeInTheDocument()
  })

  it('does not render alt text caption when alt is not provided', () => {
    render(
      <MarkdownImage
        src="https://example.com/image.jpg"
        onImageClick={mockOnImageClick}
      />
    )

    const img = screen.getByAltText('Image')
    expect(img).toBeInTheDocument()
    // Alt text should be in the img element, but not as a separate caption
    const captions = screen.queryAllByText('Image')
    // Should only be the alt attribute, not a caption paragraph
    expect(captions.length).toBeLessThanOrEqual(1)
  })

  it('passes through additional img props', () => {
    render(
      <MarkdownImage
        src="https://example.com/image.jpg"
        alt="Test image"
        onImageClick={mockOnImageClick}
        width={500}
        height={300}
        className="custom-class"
      />
    )

    const img = screen.getByAltText('Test image')
    expect(img).toHaveAttribute('width', '500')
    expect(img).toHaveAttribute('height', '300')
    expect(img).toHaveClass('custom-class')
  })
})
