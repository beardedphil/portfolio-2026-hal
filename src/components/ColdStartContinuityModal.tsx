import { useState, useEffect } from 'react'

interface ColdStartCheck {
  runId: string
  verdict: 'PASS' | 'FAIL'
  failureReason: 'missing_receipt' | 'checksum_mismatch' | 'missing_manifest_reference' | 'artifact_version_mismatch' | null
  baselineChecksum: string | null
  rebuiltChecksum: string | null
  checksumMatch: boolean | null
  bundleId: string | null
  receiptId: string | null
  integrationManifestReference: any | null
  redReference: any | null
  summary: string | null
  completedAt: string
  createdAt: string
}

interface ColdStartContinuityModalProps {
  isOpen: boolean
  onClose: () => void
  repoFullName: string | null
  supabaseUrl: string | null
  supabaseAnonKey: string | null
}

export function ColdStartContinuityModal({
  isOpen,
  onClose,
  repoFullName,
  supabaseUrl,
  supabaseAnonKey,
}: ColdStartContinuityModalProps) {
  const [checks, setChecks] = useState<ColdStartCheck[]>([])
  const [latest, setLatest] = useState<ColdStartCheck | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedCheck, setSelectedCheck] = useState<ColdStartCheck | null>(null)

  // Load check history when modal opens
  useEffect(() => {
    if (!isOpen || !repoFullName || !supabaseUrl || !supabaseAnonKey) return

    loadHistory()
  }, [isOpen, repoFullName, supabaseUrl, supabaseAnonKey])

  async function loadHistory() {
    if (!repoFullName || !supabaseUrl || !supabaseAnonKey) return

    try {
      const res = await fetch('/api/cold-start-continuity/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoFullName,
          limit: 10,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      if (!res.ok) {
        throw new Error(`Failed to load check history: ${res.statusText}`)
      }

      const data = await res.json()
      if (data.success) {
        setChecks(data.checks || [])
        setLatest(data.latest || null)
        setSelectedCheck(data.latest || null)
      } else {
        throw new Error(data.error || 'Failed to load check history')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load check history')
    }
  }

  async function handleRunCheck() {
    if (!repoFullName || !supabaseUrl || !supabaseAnonKey) {
      setError('Repository connection required')
      return
    }

    setRunning(true)
    setError(null)

    try {
      const res = await fetch('/api/cold-start-continuity/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoFullName,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      if (!res.ok) {
        throw new Error(`Failed to run check: ${res.statusText}`)
      }

      const data = await res.json()
      if (data.success) {
        // Reload history to get the new check
        await loadHistory()
      } else {
        throw new Error(data.error || 'Failed to run check')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run check')
    } finally {
      setRunning(false)
    }
  }

  function formatTimestamp(isoString: string): string {
    try {
      const date = new Date(isoString)
      return date.toLocaleString()
    } catch {
      return isoString
    }
  }

  function formatChecksum(checksum: string | null): string {
    if (!checksum) return 'N/A'
    return `${checksum.substring(0, 16)}...`
  }

  if (!isOpen) return null

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
          {!repoFullName ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--hal-text-muted)' }}>
              Please connect a repository to run cold-start continuity checks.
            </div>
          ) : (
            <>
              {/* Run button */}
              <div style={{ marginBottom: '2rem' }}>
                <button
                  type="button"
                  className="btn-standard"
                  onClick={handleRunCheck}
                  disabled={running}
                  style={{ width: '100%', padding: '12px' }}
                >
                  {running ? 'Running Cold-start Continuity Check...' : 'Run Cold-start Continuity Check'}
                </button>
              </div>

              {/* Error message */}
              {error && (
                <div
                  style={{
                    padding: '1rem',
                    background: 'rgba(198, 40, 40, 0.1)',
                    border: '1px solid var(--hal-status-error)',
                    borderRadius: '6px',
                    color: 'var(--hal-status-error)',
                    marginBottom: '1rem',
                  }}
                >
                  {error}
                </div>
              )}

              {/* Latest result */}
              {latest && (
                <section style={{ marginBottom: '2rem' }}>
                  <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 600 }}>Latest Result</h4>
                  <div
                    style={{
                      border: '1px solid var(--hal-border)',
                      borderRadius: '6px',
                      padding: '1rem',
                      background: latest.verdict === 'PASS' ? 'rgba(76, 175, 80, 0.1)' : 'rgba(198, 40, 40, 0.1)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                      <span
                        style={{
                          padding: '4px 12px',
                          borderRadius: '4px',
                          fontWeight: 600,
                          background: latest.verdict === 'PASS' ? 'rgba(76, 175, 80, 0.2)' : 'rgba(198, 40, 40, 0.2)',
                          color: latest.verdict === 'PASS' ? '#4caf50' : '#c62828',
                        }}
                      >
                        {latest.verdict}
                      </span>
                      <span style={{ color: 'var(--hal-text-muted)', fontSize: '0.9rem' }}>
                        {formatTimestamp(latest.completedAt)}
                      </span>
                    </div>
                    <div style={{ marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--hal-text-muted)' }}>
                      Run ID: {latest.runId}
                    </div>
                    {latest.summary && (
                      <div style={{ marginBottom: '0.5rem', fontSize: '0.95rem' }}>{latest.summary}</div>
                    )}
                    {latest.failureReason && (
                      <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: 'var(--hal-status-error)' }}>
                        Failure reason: {latest.failureReason}
                      </div>
                    )}
                    {latest.checksumMatch !== null && (
                      <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
                        Checksum match: {latest.checksumMatch ? '✓ Yes' : '✗ No'}
                        {latest.baselineChecksum && (
                          <div style={{ marginTop: '0.25rem', fontSize: '0.85rem', color: 'var(--hal-text-muted)' }}>
                            Baseline: {formatChecksum(latest.baselineChecksum)}
                          </div>
                        )}
                        {latest.rebuiltChecksum && (
                          <div style={{ fontSize: '0.85rem', color: 'var(--hal-text-muted)' }}>
                            Rebuilt: {formatChecksum(latest.rebuiltChecksum)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* History */}
              {checks.length > 0 && (
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
                            Run ID
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {checks.map((check) => (
                          <tr
                            key={check.runId}
                            onClick={() => setSelectedCheck(check)}
                            style={{
                              cursor: 'pointer',
                              background: selectedCheck?.runId === check.runId ? 'var(--hal-surface-alt)' : 'transparent',
                            }}
                            onMouseEnter={(e) => {
                              if (selectedCheck?.runId !== check.runId) {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (selectedCheck?.runId !== check.runId) {
                                e.currentTarget.style.background = 'transparent'
                              }
                            }}
                          >
                            <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--hal-border)' }}>
                              {formatTimestamp(check.completedAt)}
                            </td>
                            <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--hal-border)' }}>
                              <span
                                style={{
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  fontSize: '0.85rem',
                                  fontWeight: 600,
                                  background:
                                    check.verdict === 'PASS' ? 'rgba(76, 175, 80, 0.2)' : 'rgba(198, 40, 40, 0.2)',
                                  color: check.verdict === 'PASS' ? '#4caf50' : '#c62828',
                                }}
                              >
                                {check.verdict}
                              </span>
                            </td>
                            <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--hal-border)', fontSize: '0.85rem', color: 'var(--hal-text-muted)' }}>
                              {check.runId}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* Selected check details */}
              {selectedCheck && (
                <section style={{ marginTop: '2rem', padding: '1rem', border: '1px solid var(--hal-border)', borderRadius: '6px' }}>
                  <h4 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: 600 }}>Check Details</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.9rem' }}>
                    <div>
                      <strong>Run ID:</strong> {selectedCheck.runId}
                    </div>
                    <div>
                      <strong>Verdict:</strong>{' '}
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          background:
                            selectedCheck.verdict === 'PASS' ? 'rgba(76, 175, 80, 0.2)' : 'rgba(198, 40, 40, 0.2)',
                          color: selectedCheck.verdict === 'PASS' ? '#4caf50' : '#c62828',
                        }}
                      >
                        {selectedCheck.verdict}
                      </span>
                    </div>
                    {selectedCheck.failureReason && (
                      <div>
                        <strong>Failure Reason:</strong> {selectedCheck.failureReason}
                      </div>
                    )}
                    <div>
                      <strong>Completed:</strong> {formatTimestamp(selectedCheck.completedAt)}
                    </div>
                    {selectedCheck.summary && (
                      <div>
                        <strong>Summary:</strong> {selectedCheck.summary}
                      </div>
                    )}
                    {selectedCheck.checksumMatch !== null && (
                      <div>
                        <strong>Checksum Match:</strong> {selectedCheck.checksumMatch ? 'Yes' : 'No'}
                      </div>
                    )}
                    {selectedCheck.baselineChecksum && (
                      <div>
                        <strong>Baseline Checksum:</strong> {formatChecksum(selectedCheck.baselineChecksum)}
                      </div>
                    )}
                    {selectedCheck.rebuiltChecksum && (
                      <div>
                        <strong>Rebuilt Checksum:</strong> {formatChecksum(selectedCheck.rebuiltChecksum)}
                      </div>
                    )}
                    {selectedCheck.bundleId && (
                      <div>
                        <strong>Bundle ID:</strong> {selectedCheck.bundleId}
                      </div>
                    )}
                    {selectedCheck.receiptId && (
                      <div>
                        <strong>Receipt ID:</strong> {selectedCheck.receiptId}
                      </div>
                    )}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
