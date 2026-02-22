import { useState, useEffect } from 'react'

interface CodeQualityDetails {
  topOffenders: Array<{
    file: string
    codeQuality: number
  }>
  mostRecentImprovements: Array<{
    file: string
    before: number | null
    after: number
    delta: number
  }>
  generatedAt: string
  filesAnalyzed?: number
  unroundedCodeQuality?: number
  // Legacy fields for backward compatibility during migration
  maintainability?: number
  unroundedMaintainability?: number
  unroundedSimplicity?: number
}

interface CodeQualityReportModalProps {
  isOpen: boolean
  onClose: () => void
}

export function CodeQualityReportModal({ isOpen, onClose }: CodeQualityReportModalProps) {
  const [details, setDetails] = useState<CodeQualityDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return

    setLoading(true)
    setError(null)
    // Try code-quality-details.json first, fall back to maintainability-details.json and simplicity-details.json for backward compatibility
    Promise.race([
      fetch('/code-quality-details.json').then(res => res.ok ? res.json() : Promise.reject(new Error('Not found'))),
      fetch('/maintainability-details.json').then(res => res.ok ? res.json() : Promise.reject(new Error('Not found'))),
      fetch('/simplicity-details.json').then(res => res.ok ? res.json() : Promise.reject(new Error('Not found')))
    ])
      .then((data: any) => {
        // Map legacy fields to new structure
        const mapped: CodeQualityDetails = {
          ...data,
          topOffenders: (data.topOffenders || []).map((item: any) => ({
            file: item.file,
            codeQuality: item.codeQuality ?? item.maintainability ?? 0
          })),
          mostRecentImprovements: (data.mostRecentImprovements || []).map((item: any) => ({
            ...item,
            before: item.before ?? null,
            after: item.after ?? item.codeQuality ?? item.maintainability ?? 0,
            delta: item.delta ?? 0
          })),
          unroundedCodeQuality: data.unroundedCodeQuality ?? data.unroundedMaintainability ?? data.unroundedSimplicity
        }
        setDetails(mapped)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message || 'Failed to load code quality details')
        setLoading(false)
      })
  }, [isOpen])

  if (!isOpen) return null

  // Convert code quality index (0-171) to percentage (0-100)
  const codeQualityToPercent = (cq: number) => Math.round((cq / 171) * 100 * 10) / 10

  // Support both new and legacy field names
  const unroundedCodeQuality = details?.unroundedCodeQuality

  return (
    <div className="conversation-modal-overlay" onClick={onClose}>
      <div className="conversation-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="conversation-modal-header">
          <h3>Code Quality Report</h3>
          <button
            type="button"
            className="conversation-modal-close btn-destructive"
            onClick={onClose}
            aria-label="Close code quality report"
          >
            ×
          </button>
        </div>
        <div className="conversation-modal-content" style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
          {loading && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--hal-text-muted)' }}>Loading code quality details...</div>}
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
                  {unroundedCodeQuality !== undefined && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, color: 'var(--hal-text-muted)' }}>Unrounded code quality:</span>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>{unroundedCodeQuality.toFixed(1)}%</span>
                    </div>
                  )}
                  {unroundedCodeQuality !== undefined && (
                    <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'rgba(0, 0, 0, 0.05)', borderRadius: '4px', fontSize: '0.85rem', color: 'var(--hal-text-muted)' }}>
                      <strong>Note:</strong> The displayed code quality value ({Math.round(unroundedCodeQuality)}%) is rounded from {unroundedCodeQuality.toFixed(1)}%
                    </div>
                  )}
                  <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'rgba(0, 100, 200, 0.1)', borderRadius: '4px', fontSize: '0.85rem', color: 'var(--hal-text-muted)' }}>
                    <strong>Higher is better:</strong> Code Quality is displayed as a percentage (0-100%), where higher values indicate better code quality.
                  </div>
                </div>
              </section>

              <section>
                <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 600 }}>Top Offenders</h4>
                <p style={{ margin: '0 0 1rem 0', color: 'var(--hal-text-muted)', fontSize: '0.9rem' }}>
                  Files with the lowest code quality (top 20)
                </p>
                {details.topOffenders.length === 0 ? (
                  <p style={{ color: 'var(--hal-text-muted)' }}>No data available</p>
                ) : (
                  <div style={{ border: '1px solid var(--hal-border)', borderRadius: '6px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                      <thead>
                        <tr style={{ background: 'var(--hal-surface-alt)' }}>
                          <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--hal-border)' }}>File</th>
                          <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid var(--hal-border)' }}>Code Quality</th>
                        </tr>
                      </thead>
                      <tbody>
                        {details.topOffenders.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: idx < details.topOffenders.length - 1 ? '1px solid var(--hal-border)' : 'none' }}>
                            <td style={{ padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.85rem' }}>{item.file}</td>
                            <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 500 }}>{codeQualityToPercent(item.codeQuality).toFixed(1)}%</td>
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
                            <td style={{ padding: '0.75rem', textAlign: 'right' }}>{item.before !== null ? `${codeQualityToPercent(item.before).toFixed(1)}%` : 'N/A'}</td>
                            <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 500 }}>{codeQualityToPercent(item.after).toFixed(1)}%</td>
                            <td style={{ padding: '0.75rem', textAlign: 'right', color: item.delta > 0 ? 'var(--hal-status-success)' : 'var(--hal-text-muted)', fontWeight: 500 }}>
                              {item.delta > 0 ? '+' : ''}{codeQualityToPercent(item.delta).toFixed(1)}%
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
