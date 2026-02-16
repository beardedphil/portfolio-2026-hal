import React from 'react'

interface DisconnectConfirmModalProps {
  isOpen: boolean
  onConfirm: () => void
  onCancel: () => void
  confirmButtonRef: React.RefObject<HTMLButtonElement>
}

export function DisconnectConfirmModal({
  isOpen,
  onConfirm,
  onCancel,
  confirmButtonRef,
}: DisconnectConfirmModalProps) {
  if (!isOpen) return null

  return (
    <div className="conversation-modal-overlay" onClick={onCancel}>
      <div
        className="conversation-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="disconnect-confirm-title"
        aria-modal="true"
      >
        <div className="conversation-modal-header">
          <h3 id="disconnect-confirm-title">Disconnect this repository?</h3>
          <button
            type="button"
            className="conversation-modal-close btn-destructive"
            onClick={onCancel}
            aria-label="Close confirmation"
          >
            ×
          </button>
        </div>
        <div className="conversation-modal-content">
          <div style={{ padding: '1.25rem' }}>
            <p style={{ margin: '0 0 1.5rem 0', color: 'var(--hal-text)' }}>
              Are you sure you want to disconnect from this repository? You can reconnect later.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-standard" onClick={onCancel}>
                Cancel
              </button>
              <button
                ref={confirmButtonRef}
                type="button"
                className="btn-destructive"
                onClick={onConfirm}
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
