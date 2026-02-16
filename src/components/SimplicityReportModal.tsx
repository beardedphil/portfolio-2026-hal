import { useState, useEffect } from 'react'

interface SimplicityDetails {
  topOffenders: Array<{
    file: string
    maintainability: number
  }>
  mostRecentImprovements: Array<{
    file: string
    before: number | null
    after: number
    delta: number
  }>
  generatedAt: string
  filesAnalyzed?: number
  unroundedSimplicity?: number
}

interface SimplicityReportModalProps {
  isOpen: boolean
  onClose: () => void
}

export function SimplicityReportModal({ isOpen, onClose }: SimplicityReportModalProps) {
  const [details, setDetails] = useState<SimplicityDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return

    setLoading(true)
    setError(null)
    fetch('/simplicity-details.json')
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load: ${res.statusText}`)
        return res.json()
      })
      .then((data: SimplicityDetails) => {
        setDetails(data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message || 'Failed to load simplicity details')
        setLoading(false)
      })
  }, [isOpen])

  if (!isOpen) return null

  // Convert maintainability index (0-171) to percentage (0-100)
  const maintainabilityToPercent = (mi: number) => Math.round((mi / 171) * 100 * 10) / 10

  return (
    <div className="conversation-modal-overlay" onClick={onClose}>
      <div className="conversation-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="conversation-modal-header">
          <h3>Simplicity Report</h3>
          <button
            type="button"
            className="conversation-modal-close btn-destructive"
            onClick={onClose}
            aria-label="Close simplicity report"
          >
            ×
          </button>
        </div>
        <div className="conversation-modal-content" style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
          {loading && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--hal-text-muted)' }}>Loading simplicity details...</div>}
          {error && (
            <div style={{ padding: '1rem', background: 'rgba(198, 40, 40, 0.1)', border: '1px solid var(--hal-status-error)', borderRadius: '6px', color: 'var(--hal-status-error)' }}>
              {error}
            </div>
          )}
          {!loading && !error && details && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              <section>
                <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 600 }}>Report Information</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem', padding: '1rem', background: 'var(--hal-surface-alt)', borderRadius: '6px', border: '1px solid var(--hal-border)' }}>
                  {details.generatedAt && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, color: 'var(--hal-text-muted)' }}>Generated at:</span>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>{new Date(details.generatedAt).toLocaleString()}</span>
                    </div>
                  )}
                  {details.filesAnalyzed !== undefined && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, color: 'var(--hal-text-muted)' }}>Files analyzed:</span>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>{details.filesAnalyzed.toLocaleString()}</span>
                    </div>
                  )}
                  {details.unroundedSimplicity !== undefined && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, color: 'var(--hal-text-muted)' }}>Unrounded simplicity:</span>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>{details.unroundedSimplicity.toFixed(1)}%</span>
                    </div>
                  )}
                  {details.unroundedSimplicity !== undefined && (
                    <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'rgba(0, 0, 0, 0.05)', borderRadius: '4px', fontSize: '0.85rem', color: 'var(--hal-text-muted)' }}>
                      <strong>Note:</strong> The displayed simplicity value ({Math.round(details.unroundedSimplicity)}%) is rounded from {details.unroundedSimplicity.toFixed(1)}%
                    </div>
                  )}
                </div>
              </section>

              <section>
                <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 600 }}>Top Offenders</h4>
                <p style={{ margin: '0 0 1rem 0', color: 'var(--hal-text-muted)', fontSize: '0.9rem' }}>
                  Files with the lowest maintainability (top 20)
                </p>
                {details.topOffenders.length === 0 ? (
                  <p style={{ color: 'var(--hal-text-muted)' }}>No data available</p>
                ) : (
                  <div style={{ border: '1px solid var(--hal-border)', borderRadius: '6px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                      <thead>
                        <tr style={{ background: 'var(--hal-surface-alt)' }}>
                          <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--hal-border)' }}>File</th>
                          <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid var(--hal-border)' }}>Maintainability</th>
                        </tr>
                      </thead>
                      <tbody>
                        {details.topOffenders.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: idx < details.topOffenders.length - 1 ? '1px solid var(--hal-border)' : 'none' }}>
                            <td style={{ padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.85rem' }}>{item.file}</td>
                            <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 500 }}>{maintainabilityToPercent(item.maintainability).toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section>
                <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 600 }}>Most Recent Improvements</h4>
                <p style={{ margin: '0 0 1rem 0', color: 'var(--hal-text-muted)', fontSize: '0.9rem' }}>
                  Files that improved most since the previous report (top 10)
                </p>
                {details.mostRecentImprovements.length === 0 ? (
                  <p style={{ color: 'var(--hal-text-muted)' }}>
                    {details.topOffenders.length > 0 ? 'No baseline available for comparison' : 'No data available'}
                  </p>
                ) : (
                  <div style={{ border: '1px solid var(--hal-border)', borderRadius: '6px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                      <thead>
                        <tr style={{ background: 'var(--hal-surface-alt)' }}>
                          <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--hal-border)' }}>File</th>
                          <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid var(--hal-border)' }}>Before</th>
                          <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid var(--hal-border)' }}>After</th>
                          <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid var(--hal-border)' }}>Delta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {details.mostRecentImprovements.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: idx < details.mostRecentImprovements.length - 1 ? '1px solid var(--hal-border)' : 'none' }}>
                            <td style={{ padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.85rem' }}>{item.file}</td>
                            <td style={{ padding: '0.75rem', textAlign: 'right' }}>{item.before !== null ? `${maintainabilityToPercent(item.before).toFixed(1)}%` : 'N/A'}</td>
                            <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 500 }}>{maintainabilityToPercent(item.after).toFixed(1)}%</td>
                            <td style={{ padding: '0.75rem', textAlign: 'right', color: item.delta > 0 ? 'var(--hal-status-success)' : 'var(--hal-text-muted)', fontWeight: 500 }}>
                              {item.delta > 0 ? '+' : ''}{maintainabilityToPercent(item.delta).toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
