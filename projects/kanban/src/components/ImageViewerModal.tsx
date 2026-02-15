import React, { useRef, useEffect, useCallback } from 'react'

/** Image viewer modal for full-size image display (0158) */
export function ImageViewerModal({
  open,
  onClose,
  imageSrc,
  imageAlt,
}: {
  open: boolean
  onClose: () => void
  imageSrc: string | null
  imageAlt: string
}) {
  const modalRef = useRef<HTMLDivElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!open || !modalRef.current) return
    const el = closeBtnRef.current ?? modalRef.current.querySelector<HTMLElement>('button, [href]')
    el?.focus()
  }, [open])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
    },
    [onClose]
  )

  if (!open || !imageSrc) return null

  return (
    <div
      className="ticket-detail-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={handleKeyDown}
    >
      <div className="ticket-detail-modal" ref={modalRef} style={{ maxWidth: '90vw', maxHeight: '90vh', padding: '1rem' }}>
        <div className="ticket-detail-header">
          <h2 id="image-viewer-title" className="ticket-detail-title" style={{ fontSize: '1.25rem' }}>
            {imageAlt || 'Image'}
          </h2>
          <button
            type="button"
            className="ticket-detail-close"
            onClick={onClose}
            ref={closeBtnRef}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="ticket-detail-body-wrap" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem' }}>
          <img
            src={imageSrc}
            alt={imageAlt}
            style={{
              maxWidth: '100%',
              maxHeight: 'calc(90vh - 100px)',
              objectFit: 'contain',
              borderRadius: '4px',
            }}
            onError={(e) => {
              const target = e.currentTarget
              target.style.display = 'none'
              const parent = target.parentElement
              if (parent) {
                const errorMsg = document.createElement('p')
                errorMsg.textContent = `Unable to display image: ${imageAlt || 'Unknown image'}`
                errorMsg.style.color = 'var(--kanban-error)'
                errorMsg.style.padding = '2rem'
                errorMsg.style.textAlign = 'center'
                parent.appendChild(errorMsg)
              }
            }}
          />
        </div>
      </div>
    </div>
  )
}
