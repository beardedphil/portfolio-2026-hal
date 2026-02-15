import React, { useState, useCallback, useEffect } from 'react'

/** Custom image component for ReactMarkdown (0158) */
export function MarkdownImage({
  src,
  alt,
  artifactTitle,
  onImageClick,
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement> & {
  src?: string
  alt?: string
  artifactTitle?: string
  onImageClick: (src: string, alt: string) => void
}) {
  const [imageError, setImageError] = useState(false)
  const imageSrc = src || null
  
  // Handle image load error
  const handleError = useCallback(() => {
    console.warn('[MarkdownImage] Image failed to load:', imageSrc?.substring(0, 100))
    setImageError(true)
  }, [imageSrc])

  // Debug: log what we received
  useEffect(() => {
    if (imageSrc) {
      console.log('[MarkdownImage] Component mounted with src:', imageSrc.substring(0, 100) + '...', 'alt:', alt)
    } else {
      console.warn('[MarkdownImage] Component mounted WITHOUT src. Props:', { src, alt, hasSrc: !!src })
    }
  }, []) // Only log on mount

  // If no src at all, show fallback immediately
  if (!imageSrc) {
    return (
      <div
        style={{
          padding: '1rem',
          border: '1px solid var(--kanban-border)',
          borderRadius: '4px',
          backgroundColor: 'var(--kanban-surface-alt)',
          color: 'var(--kanban-text-muted)',
          textAlign: 'center',
        }}
      >
        <p style={{ margin: 0 }}>
          No image source provided: {alt || artifactTitle || 'Unknown image'}
        </p>
        <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--kanban-text-subtle)' }}>
          Debug: src={String(src)}, alt={String(alt)}
        </p>
      </div>
    )
  }

  // If image failed to load, show fallback
  if (imageError) {
    return (
      <div
        style={{
          padding: '1rem',
          border: '1px solid var(--kanban-border)',
          borderRadius: '4px',
          backgroundColor: 'var(--kanban-surface-alt)',
          color: 'var(--kanban-text-muted)',
          textAlign: 'center',
        }}
      >
        <p style={{ margin: 0 }}>
          Unable to display image: {alt || artifactTitle || 'Unknown image'}
        </p>
      </div>
    )
  }

  return (
    <div style={{ margin: '1rem 0', textAlign: 'center' }}>
      <img
        {...props}
        src={imageSrc}
        alt={alt || artifactTitle || 'Image'}
        onClick={() => onImageClick(imageSrc, alt || artifactTitle || 'Image')}
        onError={handleError}
        onLoad={() => console.log('[MarkdownImage] Image loaded successfully:', imageSrc?.substring(0, 50) + '...')}
        style={{
          maxWidth: '100%',
          height: 'auto',
          cursor: 'pointer',
          borderRadius: '4px',
          border: '1px solid var(--kanban-border)',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        }}
        title="Click to view full size"
      />
      {alt && (
        <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: 'var(--kanban-text-muted)', fontStyle: 'italic' }}>
          {alt}
        </p>
      )}
    </div>
  )
}
