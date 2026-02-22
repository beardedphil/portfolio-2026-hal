import { useState, useEffect, useRef } from 'react'

interface ColdStartContinuityModalProps {
  isOpen: boolean
  onClose: () => void
  supabaseUrl: string | null
  supabaseAnonKey: string | null
}

interface CheckResult {
  runId: string
  runTimestamp: string
  verdict: 'PASS' | 'FAIL'
  failureReason: string | null
  summary: string | null
  details?: {
    baselineContentChecksum?: string
    rebuiltContentChecksum?: string
    baselineBundleChecksum?: string
    rebuiltBundleChecksum?: string
    contentChecksumMatch?: boolean
    bundleChecksumMatch?: boolean
    baselineManifestReference?: string | null
    rebuiltManifestReference?: string | null
    manifestReferenceMatch?: boolean
  }
  errorMessage?: string | null
}

interface CheckHistoryItem {
  runId: string
  runTimestamp: string
  verdict: 'PASS' | 'FAIL'
  failureReason: string | null
  summary: string | null
}

interface ListResponse {
  success: boolean
  latest: CheckResult | null
  history: CheckHistoryItem[]
  error?: string
}

interface RunResponse {
  success: boolean
  runId?: string
  runTimestamp?: string
  verdict?: 'PASS' | 'FAIL'
  failureReason?: string | null
  summary?: string | null
  details?: CheckResult['details']
  error?: string
}

export function ColdStartContinuityModal({
  isOpen,
  onClose,
  supabaseUrl,
  supabaseAnonKey,
}: ColdStartContinuityModalProps) {
  const [latest, setLatest] = useState<CheckResult | null>(null)
  const [history, setHistory] = useState<CheckHistoryItem[]>([])
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<CheckHistoryItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const apiBaseUrlRef = useRef<string>('')

  // Load API base URL
  useEffect(() => {
    async function loadApiBaseUrl() {
      try {
        const response = await fetch('/.hal/api-base-url')
        if (response.ok) {
          const url = (await response.text()).trim()
          apiBaseUrlRef.current = url || window.location.origin
        } else {
          apiBaseUrlRef.current = window.location.origin
        }
      } catch {
        apiBaseUrlRef.current = window.location.origin
      }
    }
    loadApiBaseUrl()
  }, [])

  // Load check history when modal opens
  useEffect(() => {
    if (isOpen && supabaseUrl && supabaseAnonKey) {
      loadHistory()
    }
  }, [isOpen, supabaseUrl, supabaseAnonKey])

  async function loadHistory() {
    if (!supabaseUrl || !supabaseAnonKey) return

    setLoading(true)
    setError(null)

    try {
      const baseUrl = apiBaseUrlRef.current || window.location.origin
      const res = await fetch(`${baseUrl}/api/cold-start-continuity/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: 10,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      if (!res.ok) {
        throw new Error(`Failed to load history: ${res.statusText}`)
      }

      const data: ListResponse = await res.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to load history')
      }

      setLatest(data.latest)
      setHistory(data.history)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history')
    } finally {
      setLoading(false)
    }
  }

  async function runCheck() {
    if (!supabaseUrl || !supabaseAnonKey) {
      setError('Supabase credentials required')
      return
    }

    setRunning(true)
    setError(null)

    try {
      const baseUrl = apiBaseUrlRef.current || window.location.origin
      const res = await fetch(`${baseUrl}/api/cold-start-continuity/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      if (!res.ok) {
        throw new Error(`Failed to run check: ${res.statusText}`)
      }

      const data: RunResponse = await res.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to run check')
      }

      // Reload history to get the new result
      await loadHistory()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run check')
    } finally {
      setRunning(false)
    }
  }

  function formatTimestamp(timestamp: string): string {
    try {
      return new Date(timestamp).toLocaleString()
    } catch {
      return timestamp
    }
  }

  function getFailureReasonLabel(reason: string | null): string {
    switch (reason) {
      case 'missing_receipt':
        return 'Missing receipt'
      case 'checksum_mismatch':
        return 'Checksum mismatch'
      case 'missing_manifest_reference':
        return 'Missing manifest reference'
      case 'artifact_version_mismatch':
        return 'Artifact version mismatch'
      default:
        return reason || 'Unknown'
    }
  }

  if (!isOpen) return null

  const displayResult = selectedHistoryItem || latest

  return (
    <div className="conversation-modal-overlay" onClick={onClose}>
      <div
        className="conversation-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        <div className="conversation-modal-header">
          <h3>Cold-start Continuity Diagnostics</h3>
          <button
            type="button"
            className="conversation-modal-close btn-destructive"
            onClick={onClose}
            aria-label="Close cold-start continuity diagnostics"
          >
            ×
          </button>
        </div>
        <div className="conversation-modal-content" style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Run button */}
            <section>
              <button
                type="button"
                className="btn-standard"
                onClick={runCheck}
                disabled={running || !supabaseUrl || !supabaseAnonKey}
                style={{ width: '100%', padding: '0.75rem' }}
              >
                {running ? 'Running Cold-start continuity check...' : 'Run Cold-start continuity check'}
              </button>
            </section>

            {/* Error display */}
            {error && (
              <div
                style={{
                  padding: '1rem',
                  background: 'rgba(198, 40, 40, 0.1)',
                  border: '1px solid var(--hal-status-error)',
                  borderRadius: '6px',
                  color: 'var(--hal-status-error)',
                }}
              >
                {error}
              </div>
            )}

            {/* Loading state */}
            {loading && (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--hal-text-muted)' }}>
                Loading check history...
              </div>
            )}

            {/* Latest result */}
            {!loading && displayResult && (
              <section>
                <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 600 }}>
                  {selectedHistoryItem ? 'Selected Check Result' : 'Latest Result'}
                </h4>
                <div
                  style={{
                    padding: '1rem',
                    background: 'var(--hal-surface-alt)',
                    borderRadius: '6px',
                    border: '1px solid var(--hal-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                  }}
                >
                  {/* Verdict */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, color: 'var(--hal-text-muted)' }}>Verdict:</span>
                    <span
                      style={{
                        fontWeight: 700,
                        color: displayResult.verdict === 'PASS' ? 'var(--hal-status-success)' : 'var(--hal-status-error)',
                        fontSize: '1.1rem',
                      }}
                    >
                      {displayResult.verdict}
                    </span>
                  </div>

                  {/* Run timestamp */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, color: 'var(--hal-text-muted)' }}>Completed:</span>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>{formatTimestamp(displayResult.runTimestamp)}</span>
                  </div>

                  {/* Run ID */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, color: 'var(--hal-text-muted)' }}>Run ID:</span>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-all' }}>
                      {displayResult.runId}
                    </span>
                  </div>

                  {/* Summary */}
                  {displayResult.summary && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 600, color: 'var(--hal-text-muted)' }}>Summary:</span>
                      <span style={{ fontSize: '0.9rem' }}>{displayResult.summary}</span>
                    </div>
                  )}

                  {/* Failure reason */}
                  {displayResult.verdict === 'FAIL' && displayResult.failureReason && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 600, color: 'var(--hal-status-error)' }}>Failure Reason:</span>
                      <span style={{ fontSize: '0.9rem', color: 'var(--hal-status-error)' }}>
                        {getFailureReasonLabel(displayResult.failureReason)}
                      </span>
                    </div>
                  )}

                  {/* Details (only for latest or if explicitly selected) */}
                  {displayResult.details && (
                    <div
                      style={{
                        marginTop: '0.5rem',
                        padding: '1rem',
                        background: 'rgba(0, 0, 0, 0.05)',
                        borderRadius: '4px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem',
                        fontSize: '0.85rem',
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Detailed Comparisons:</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontFamily: 'monospace' }}>
                        <div>
                          Content checksum match: {displayResult.details.contentChecksumMatch ? '✓' : '✗'}
                        </div>
                        <div>
                          Bundle checksum match: {displayResult.details.bundleChecksumMatch ? '✓' : '✗'}
                        </div>
                        <div>
                          Manifest reference match: {displayResult.details.manifestReferenceMatch ? '✓' : '✗'}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Back button if viewing history item */}
                  {selectedHistoryItem && (
                    <button
                      type="button"
                      className="btn-standard"
                      onClick={() => setSelectedHistoryItem(null)}
                      style={{ marginTop: '0.5rem' }}
                    >
                      Back to Latest Result
                    </button>
                  )}
                </div>
              </section>
            )}

            {/* History list */}
            {!loading && history.length > 0 && (
              <section>
                <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 600 }}>History (Last 10 Runs)</h4>
                <div style={{ border: '1px solid var(--hal-border)', borderRadius: '6px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--hal-surface-alt)' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--hal-border)' }}>
                          Timestamp
                        </th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--hal-border)' }}>
                          Verdict
                        </th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--hal-border)' }}>
                          Failure Reason
                        </th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--hal-border)' }}>
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((item, idx) => (
                        <tr
                          key={item.runId}
                          style={{
                            borderBottom: idx < history.length - 1 ? '1px solid var(--hal-border)' : 'none',
                            cursor: 'pointer',
                          }}
                          onClick={() => {
                            // Load full details for this history item
                            setSelectedHistoryItem(item)
                            // TODO: Could fetch full details if needed
                          }}
                        >
                          <td style={{ padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                            {formatTimestamp(item.runTimestamp)}
                          </td>
                          <td style={{ padding: '0.75rem' }}>
                            <span
                              style={{
                                fontWeight: 600,
                                color: item.verdict === 'PASS' ? 'var(--hal-status-success)' : 'var(--hal-status-error)',
                              }}
                            >
                              {item.verdict}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem', fontSize: '0.85rem', color: 'var(--hal-text-muted)' }}>
                            {item.failureReason ? getFailureReasonLabel(item.failureReason) : '—'}
                          </td>
                          <td style={{ padding: '0.75rem' }}>
                            <button
                              type="button"
                              className="btn-standard"
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedHistoryItem(item)
                              }}
                              style={{ fontSize: '0.85rem', padding: '0.25rem 0.5rem' }}
                            >
                              View Details
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* No results message */}
            {!loading && !latest && history.length === 0 && (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--hal-text-muted)' }}>
                No check results yet. Click "Run Cold-start continuity check" to run your first check.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
