interface NoPrModalProps {
  isOpen: boolean
  ticketId?: string
  ticketDisplayId?: string
  onClose: () => void
  onCreatePr?: () => void
  onLinkPr?: () => void
}

export function NoPrModal({
  isOpen,
  ticketId,
  ticketDisplayId,
  onClose,
  onCreatePr,
  onLinkPr,
}: NoPrModalProps) {
  if (!isOpen) return null

  const displayId = ticketDisplayId || ticketId || 'this ticket'

  return (
    <div className="conversation-modal-overlay" onClick={onClose}>
      <div className="conversation-modal" onClick={(e) => e.stopPropagation()}>
        <div className="conversation-modal-header">
          <h3>No PR Associated</h3>
          <button
            type="button"
            className="conversation-modal-close btn-destructive"
            onClick={onClose}
            aria-label="Close modal"
          >
            ×
          </button>
        </div>
        <div className="conversation-modal-content">
          <div style={{ padding: '16px' }}>
            <p style={{ marginBottom: '16px', fontSize: '15px', lineHeight: '1.5' }}>
              Ticket <strong>{displayId}</strong> cannot be moved beyond <strong>To Do</strong> because no GitHub Pull Request is linked to it.
            </p>
            <p style={{ marginBottom: '20px', fontSize: '14px', color: 'rgba(0,0,0,0.7)', lineHeight: '1.5' }}>
              A linked PR ensures the workflow has a reviewable change anchor. Please create a PR or link an existing PR to continue.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              {onLinkPr && (
                <button
                  type="button"
                  onClick={() => {
                    onLinkPr()
                    onClose()
                  }}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '6px',
                    border: '1px solid rgba(0,0,0,0.2)',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                  }}
                >
                  Link PR
                </button>
              )}
              {onCreatePr && (
                <button
                  type="button"
                  onClick={() => {
                    onCreatePr()
                    onClose()
                  }}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#2563eb',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                  }}
                >
                  Create PR
                </button>
              )}
              {!onCreatePr && !onLinkPr && (
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#2563eb',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                  }}
                >
                  OK
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
