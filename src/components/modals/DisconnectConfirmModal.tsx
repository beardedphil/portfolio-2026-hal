import React, { useRef, useEffect } from 'react'

interface DisconnectConfirmModalProps {
  isOpen: boolean
  onConfirm: () => void
  onCancel: () => void
  disconnectButtonRef: React.RefObject<HTMLButtonElement>
}

export function DisconnectConfirmModal({ isOpen, onConfirm, onCancel, disconnectButtonRef }: DisconnectConfirmModalProps) {
  const disconnectConfirmButtonRef = useRef<HTMLButtonElement>(null)

  // Handle Esc key and focus management for disconnect confirmation modal (0142)
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    // Focus the confirm button when modal opens
    setTimeout(() => {
      disconnectConfirmButtonRef.current?.focus()
    }, 0)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onCancel])

  if (!isOpen) return null

  return (
    <div className="conversation-modal-overlay" onClick={onCancel}>
      <div className="conversation-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="disconnect-confirm-title" aria-modal="true">
        <div className="conversation-modal-header">
          <h3 id="disconnect-confirm-title">Disconnect this repository?</h3>
          <button type="button" className="conversation-modal-close" onClick={onCancel} aria-label="Close confirmation">
            ×
          </button>
        </div>
        <div className="conversation-modal-content">
          <div style={{ padding: '1.25rem' }}>
            <p style={{ margin: '0 0 1.5rem 0', color: 'var(--hal-text)' }}>
              Are you sure you want to disconnect from this repository? You can reconnect later.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={onCancel}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  border: '1px solid var(--hal-border)',
                  background: 'var(--hal-surface)',
                  color: 'var(--hal-text)',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                }}
              >
                Cancel
              </button>
              <button
                ref={disconnectConfirmButtonRef}
                type="button"
                onClick={onConfirm}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  border: '1px solid var(--hal-border)',
                  background: 'var(--hal-danger, #dc3545)',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: 500,
                }}
              >
                Yes, disconnect
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
