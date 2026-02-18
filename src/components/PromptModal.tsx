import type { Message } from '../lib/conversationStorage'

interface PromptModalProps {
  message: Message | null
  onClose: () => void
}

export function PromptModal({ message, onClose }: PromptModalProps) {
  if (!message) return null

  return (
    <div className="conversation-modal-overlay" onClick={onClose}>
      <div
        className="conversation-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        <div className="conversation-modal-header">
          <h3>Sent Prompt</h3>
          <button
            type="button"
            className="conversation-modal-close btn-destructive"
            onClick={onClose}
            aria-label="Close prompt modal"
          >
            ×
          </button>
        </div>
        <div className="conversation-modal-content" style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
          {message.promptText ? (
            <>
              <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={async () => {
                    if (message.promptText) {
                      try {
                        await navigator.clipboard.writeText(message.promptText)
                        // Show brief feedback (could be enhanced with a toast)
                        const btn = document.activeElement as HTMLButtonElement
                        if (btn) {
                          const originalText = btn.textContent
                          btn.textContent = 'Copied!'
                          setTimeout(() => {
                            btn.textContent = originalText
                          }, 2000)
                        }
                      } catch (err) {
                        console.error('Failed to copy prompt:', err)
                      }
                    }
                  }}
                  style={{
                    padding: '6px 12px',
                    background: 'var(--hal-primary, #007bff)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  Copy prompt
                </button>
              </div>
              <pre
                style={{
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  lineHeight: '1.5',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  background: 'var(--hal-bg-secondary, #f5f5f5)',
                  padding: '16px',
                  borderRadius: '4px',
                  border: '1px solid var(--hal-border, #ddd)',
                  margin: 0,
                  overflow: 'auto',
                  maxHeight: 'calc(90vh - 120px)',
                }}
              >
                {message.promptText}
              </pre>
            </>
          ) : (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--hal-text-secondary, #666)' }}>
              <p>Prompt unavailable for this message</p>
              <p style={{ fontSize: '14px', marginTop: '8px' }}>
                This message was generated without an external LLM call, or the prompt data is not available.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
