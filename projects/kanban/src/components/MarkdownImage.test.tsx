import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MarkdownImage } from './MarkdownImage'

describe('MarkdownImage', () => {
  const mockOnImageClick = vi.fn()
  const mockImageSrc = 'https://example.com/image.jpg'
  const mockAlt = 'Test image alt'

  it('renders expected img element attributes', () => {
    render(
      <MarkdownImage
        src={mockImageSrc}
        alt={mockAlt}
        onImageClick={mockOnImageClick}
      />
    )

    const img = screen.getByAltText(mockAlt)
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', mockImageSrc)
    expect(img).toHaveAttribute('alt', mockAlt)
    expect(img).toHaveAttribute('title', 'Click to view full size')
    expect(img).toHaveStyle({ cursor: 'pointer' })
  })

  it('renders with artifactTitle as alt when alt is not provided', () => {
    const artifactTitle = 'Artifact Title'
    render(
      <MarkdownImage
        src={mockImageSrc}
        artifactTitle={artifactTitle}
        onImageClick={mockOnImageClick}
      />
    )

    const img = screen.getByAltText(artifactTitle)
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('alt', artifactTitle)
  })

  it('renders with default alt when neither alt nor artifactTitle is provided', () => {
    render(
      <MarkdownImage
        src={mockImageSrc}
        onImageClick={mockOnImageClick}
      />
    )

    const img = screen.getByAltText('Image')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('alt', 'Image')
  })

  it('renders alt text caption when alt is provided', () => {
    render(
      <MarkdownImage
        src={mockImageSrc}
        alt={mockAlt}
        onImageClick={mockOnImageClick}
      />
    )

    expect(screen.getByText(mockAlt)).toBeInTheDocument()
  })

  it('does not render alt text caption when alt is not provided', () => {
    render(
      <MarkdownImage
        src={mockImageSrc}
        onImageClick={mockOnImageClick}
      />
    )

    const img = screen.getByAltText('Image')
    expect(img).toBeInTheDocument()
    // Should not have a caption paragraph
    const paragraphs = screen.queryAllByText(/^Image$/)
    // The alt text "Image" appears in the img alt attribute, but not as a separate caption
    expect(paragraphs.length).toBe(0)
  })

  it('calls onImageClick when image is clicked', () => {
    render(
      <MarkdownImage
        src={mockImageSrc}
        alt={mockAlt}
        onImageClick={mockOnImageClick}
      />
    )

    const img = screen.getByAltText(mockAlt)
    img.click()

    expect(mockOnImageClick).toHaveBeenCalledTimes(1)
    expect(mockOnImageClick).toHaveBeenCalledWith(mockImageSrc, mockAlt)
  })

  it('calls onImageClick with correct parameters when alt is missing', () => {
    const artifactTitle = 'Artifact Title'
    render(
      <MarkdownImage
        src={mockImageSrc}
        artifactTitle={artifactTitle}
        onImageClick={mockOnImageClick}
      />
    )

    const img = screen.getByAltText(artifactTitle)
    img.click()

    expect(mockOnImageClick).toHaveBeenCalledWith(mockImageSrc, artifactTitle)
  })

  it('renders fallback when src is not provided', () => {
    render(
      <MarkdownImage
        alt={mockAlt}
        onImageClick={mockOnImageClick}
      />
    )

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText(/No image source provided/)).toBeInTheDocument()
  })

  it('renders fallback when image fails to load', () => {
    // Mock console methods to avoid noise in test output
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    
    render(
      <MarkdownImage
        src="https://invalid-url-that-will-fail.com/image.jpg"
        alt={mockAlt}
        onImageClick={mockOnImageClick}
      />
    )

    const img = screen.getByAltText(mockAlt)
    // Simulate image load error
    fireEvent.error(img)

    // After error, should show fallback
    expect(screen.getByText(/Unable to display image/)).toBeInTheDocument()
    
    consoleWarnSpy.mockRestore()
  })

  it('passes through additional img props', () => {
    render(
      <MarkdownImage
        src={mockImageSrc}
        alt={mockAlt}
        onImageClick={mockOnImageClick}
        className="custom-class"
        data-testid="custom-test-id"
      />
    )

    const img = screen.getByAltText(mockAlt)
    expect(img).toHaveClass('custom-class')
    expect(img).toHaveAttribute('data-testid', 'custom-test-id')
  })
})
