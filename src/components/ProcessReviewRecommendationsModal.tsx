interface ProcessReviewRecommendation {
  text: string
  justification: string
  id: string
  error?: string
  isCreating?: boolean
}

interface ProcessReviewRecommendationsModalProps {
  recommendations: ProcessReviewRecommendation[] | null
  onImplement: (recommendationId: string) => void
  onIgnore: (recommendationId: string) => void
  onClose: () => void
}

export function ProcessReviewRecommendationsModal({
  recommendations,
  onImplement,
  onIgnore,
  onClose,
}: ProcessReviewRecommendationsModalProps) {
  if (!recommendations || recommendations.length === 0) return null

  return (
    <div
      className="conversation-modal-overlay"
      onClick={() => {
        // Only close if all recommendations are processed
        if (recommendations.length === 0) {
          onClose()
        }
      }}
    >
      <div
        className="conversation-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        <div className="conversation-modal-header">
          <h3>Process Review Recommendations</h3>
          <button
            type="button"
            className="conversation-modal-close btn-destructive"
            onClick={onClose}
            aria-label="Close recommendations modal"
          >
            ×
          </button>
        </div>
        <div className="conversation-modal-content" style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
          <p style={{ marginBottom: '16px', color: 'var(--hal-text-muted)' }}>
            Review the recommendations below. Click "Implement" to create a ticket, or "Ignore" to dismiss.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {recommendations.map((recommendation) => (
              <div
                key={recommendation.id}
                style={{
                  border: '1px solid var(--hal-border)',
                  borderRadius: '8px',
                  padding: '16px',
                  background: recommendation.error ? 'var(--hal-surface-alt)' : 'var(--hal-surface)',
                }}
              >
                <div style={{ marginBottom: '12px' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: '600' }}>
                    {recommendation.text}
                  </h4>
                  {recommendation.justification && (
                    <p style={{ margin: 0, fontSize: '14px', color: 'var(--hal-text-muted)', fontStyle: 'italic' }}>
                      {recommendation.justification}
                    </p>
                  )}
                </div>
                {recommendation.error && (
                  <div
                    style={{
                      marginBottom: '12px',
                      padding: '8px 12px',
                      background: 'var(--hal-status-error, #c62828)',
                      color: 'white',
                      borderRadius: '4px',
                      fontSize: '14px',
                    }}
                  >
                    Error: {recommendation.error}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn-destructive"
                    onClick={() => onIgnore(recommendation.id)}
                    disabled={recommendation.isCreating}
                  >
                    Ignore
                  </button>
                  <button
                    type="button"
                    className="btn-standard"
                    onClick={() => onImplement(recommendation.id)}
                    disabled={recommendation.isCreating}
                  >
                    {recommendation.isCreating ? 'Creating...' : 'Implement'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
