import { useState, useEffect, useRef } from 'react'

interface CoverageDetails {
  topOffenders: Array<{
    file: string
    coverage: number
  }>
  mostRecentImprovements: Array<{
    file: string
    before: number | null
    after: number
    delta: number
  }>
  generatedAt: string
}

function hasRealData(data: CoverageDetails): boolean {
  return Boolean(data.generatedAt || data.topOffenders?.length)
}

interface CoverageReportModalProps {
  isOpen: boolean
  onClose: () => void
  projectBaseUrl?: string | null // Base URL of connected project (e.g., 'https://user-project.vercel.app'). When provided, fetches from project instead of HAL.
}

const POLL_INTERVAL_MS = 2500
const POLL_TIMEOUT_MS = 3 * 60 * 1000

export function CoverageReportModal({ isOpen, onClose, projectBaseUrl }: CoverageReportModalProps) {
  const [details, setDetails] = useState<CoverageDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollUntilRef = useRef<number>(0)
  const cancelledRef = useRef(false)

  useEffect(() => {
    if (!isOpen) return
    cancelledRef.current = false
    setLoading(true)
    setError(null)
    setGenerating(false)
    setDetails(null)

    const coverageDetailsUrl = projectBaseUrl ? `${projectBaseUrl}/coverage-details.json` : '/coverage-details.json'
    const runCoverageUrl = projectBaseUrl ? `${projectBaseUrl}/api/run-coverage` : '/api/run-coverage'

    async function load() {
      try {
        const res = await fetch(coverageDetailsUrl)
        if (!res.ok) throw new Error(res.statusText)
        const ct = res.headers.get('content-type') ?? ''
        if (!ct.includes('application/json')) throw new Error('Non-JSON response')
        const data: CoverageDetails = await res.json()
        if (hasRealData(data)) {
          setDetails(data)
          setLoading(false)
          return
        }
        // No data: start coverage run and poll until data exists
        setGenerating(true)
        setLoading(false)
        await fetch(runCoverageUrl, { method: 'POST' })
        if (cancelledRef.current) return
        pollUntilRef.current = Date.now() + POLL_TIMEOUT_MS
        poll()
      } catch {
        if (cancelledRef.current) return
        setGenerating(true)
        setLoading(false)
        await fetch(runCoverageUrl, { method: 'POST' }).catch(() => {})
        if (cancelledRef.current) return
        pollUntilRef.current = Date.now() + POLL_TIMEOUT_MS
        poll()
      }
    }

    function poll() {
      if (cancelledRef.current) return
      if (Date.now() > pollUntilRef.current) {
        setGenerating(false)
        setError('Generation timed out. Try running npm run test:coverage in the terminal.')
        return
      }
      fetch(coverageDetailsUrl)
        .then((r) => (r.ok ? r.json() : null))
        .then((data: CoverageDetails | null) => {
          if (cancelledRef.current) return
          if (data && hasRealData(data)) {
            setDetails(data)
            setGenerating(false)
            setError(null)
            return
          }
          setTimeout(poll, POLL_INTERVAL_MS)
        })
        .catch(() => {
          if (!cancelledRef.current) setTimeout(poll, POLL_INTERVAL_MS)
        })
    }

    load()
    return () => {
      cancelledRef.current = true
    }
  }, [isOpen, projectBaseUrl])

  if (!isOpen) return null

  return (
    <div className="conversation-modal-overlay" onClick={onClose}>
      <div className="conversation-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="conversation-modal-header">
          <h3>Test Coverage Report</h3>
          <button
            type="button"
            className="conversation-modal-close btn-destructive"
            onClick={onClose}
            aria-label="Close test coverage report"
          >
            ×
          </button>
        </div>
        <div className="conversation-modal-content" style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
          {loading && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--hal-text-muted)' }}>Loading test coverage details...</div>}
          {generating && !details && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--hal-text-muted)' }}>
              Running tests and generating coverage… This may take a minute or two.
            </div>
          )}
          {error && !generating && (
            <div style={{ padding: '1rem', background: 'rgba(198, 40, 40, 0.1)', border: '1px solid var(--hal-status-error)', borderRadius: '6px', color: 'var(--hal-status-error)' }}>
              {error}
            </div>
          )}
          {!loading && !error && details && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              <section>
                <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 600 }}>Top Offenders</h4>
                <p style={{ margin: '0 0 1rem 0', color: 'var(--hal-text-muted)', fontSize: '0.9rem' }}>
                  Files with the lowest coverage (top 20)
                </p>
                {details.topOffenders.length === 0 ? (
                  <p style={{ color: 'var(--hal-text-muted)' }}>No data available</p>
                ) : (
                  <div style={{ border: '1px solid var(--hal-border)', borderRadius: '6px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                      <thead>
                        <tr style={{ background: 'var(--hal-surface-alt)' }}>
                          <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--hal-border)' }}>File</th>
                          <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid var(--hal-border)' }}>Test Coverage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {details.topOffenders.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: idx < details.topOffenders.length - 1 ? '1px solid var(--hal-border)' : 'none' }}>
                            <td style={{ padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.85rem' }}>{item.file}</td>
                            <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 500 }}>{item.coverage.toFixed(1)}%</td>
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
                            <td style={{ padding: '0.75rem', textAlign: 'right' }}>{item.before !== null ? `${item.before.toFixed(1)}%` : 'N/A'}</td>
                            <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 500 }}>{item.after.toFixed(1)}%</td>
                            <td style={{ padding: '0.75rem', textAlign: 'right', color: item.delta > 0 ? 'var(--hal-status-success)' : 'var(--hal-text-muted)', fontWeight: 500 }}>
                              {item.delta > 0 ? '+' : ''}{item.delta.toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {details.generatedAt && (
                <div style={{ fontSize: '0.85rem', color: 'var(--hal-text-muted)', textAlign: 'right' }}>
                  Generated: {new Date(details.generatedAt).toLocaleString()}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
