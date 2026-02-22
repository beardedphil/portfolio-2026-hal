import { useState, useEffect, useRef } from 'react'

interface ColdStartContinuityModalProps {
  isOpen: boolean
  onClose: () => void
  ticketPk: string | null
  ticketId: string | null
  repoFullName: string | null
  supabaseUrl: string | null
  supabaseAnonKey: string | null
}

interface ContinuityCheckResult {
  runId: string
  bundleId: string
  receiptId: string | null
  ticketId: string
  role: string
  verdict: 'PASS' | 'FAIL'
  completedAt: string
  failureReason: string | null
  summary: string
  baselineChecksums: {
    content_checksum: string
    bundle_checksum: string
  }
  rebuiltChecksums: {
    content_checksum: string
    bundle_checksum: string
  } | null
  comparisons: {
    content_checksum_match: boolean
    bundle_checksum_match: boolean
    rebuild_succeeded?: boolean
  }
}

interface ContinuityCheckHistoryItem {
  runId: string
  bundleId: string
  receiptId: string | null
  ticketId: string
  role: string
  verdict: 'PASS' | 'FAIL'
  completedAt: string
  failureReason: string | null
  summary: string
  baselineChecksums: {
    content_checksum: string
    bundle_checksum: string
  }
  rebuiltChecksums: {
    content_checksum: string
    bundle_checksum: string
  } | null
  comparisons: {
    content_checksum_match: boolean
    bundle_checksum_match: boolean
    rebuild_succeeded?: boolean
  }
}

export function ColdStartContinuityModal({
  isOpen,
  onClose,
  ticketPk,
  ticketId,
  repoFullName,
  supabaseUrl,
  supabaseAnonKey,
}: ColdStartContinuityModalProps) {
  const [running, setRunning] = useState(false)
  const [latestResult, setLatestResult] = useState<ContinuityCheckResult | null>(null)
  const [history, setHistory] = useState<ContinuityCheckHistoryItem[]>([])
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<ContinuityCheckHistoryItem | null>(null)
  const [error, setError] = useState<string | null>(null)
  const apiBaseUrlRef = useRef<string | null>(null)

  useEffect(() => {
    // Get API base URL from .hal/api-base-url file or use current origin
    fetch('/.hal/api-base-url')
      .then((res) => res.text())
      .then((url) => {
        apiBaseUrlRef.current = url.trim() || window.location.origin
      })
      .catch(() => {
        apiBaseUrlRef.current = window.location.origin
      })
  }, [])

  useEffect(() => {
    if (isOpen && supabaseUrl && supabaseAnonKey && (ticketPk || ticketId)) {
      loadHistory()
    }
  }, [isOpen, supabaseUrl, supabaseAnonKey, ticketPk, ticketId, repoFullName])

  const loadHistory = async () => {
    if (!supabaseUrl || !supabaseAnonKey || (!ticketPk && !ticketId)) return

    try {
      const apiBaseUrl = apiBaseUrlRef.current || window.location.origin
      const response = await fetch(`${apiBaseUrl}/api/cold-start-continuity/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketPk,
          ticketId,
          repoFullName,
          limit: 10,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const data = (await response.json()) as {
        success: boolean
        checks?: ContinuityCheckHistoryItem[]
        error?: string
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to load history')
      }

      const checks = data.checks || []
      setHistory(checks)
      if (checks.length > 0) {
        setLatestResult(checks[0])
      }
    } catch (err) {
      console.error('Failed to load continuity check history:', err)
      setHistory([])
    }
  }

  const runCheck = async () => {
    if (!supabaseUrl || !supabaseAnonKey || (!ticketPk && !ticketId)) {
      setError('Supabase connection and ticket information required')
      return
    }

    setRunning(true)
    setError(null)
    setSelectedHistoryItem(null)

    try {
      const apiBaseUrl = apiBaseUrlRef.current || window.location.origin

      // First, we need to get a bundle ID. Let's fetch the latest bundle for this ticket
      // For now, we'll use the ticket to find a bundle. In a real scenario, we might want
      // to let the user select a bundle, but for simplicity, we'll use the latest bundle.
      const bundleListResponse = await fetch(`${apiBaseUrl}/api/context-bundles/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketPk,
          ticketId,
          repoFullName,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const bundleListData = (await bundleListResponse.json()) as {
        success: boolean
        bundles?: Array<{ bundle_id: string }>
        error?: string
      }

      if (!bundleListData.success || !bundleListData.bundles || bundleListData.bundles.length === 0) {
        throw new Error('No bundles found for this ticket. Generate a context bundle first.')
      }

      const bundleId = bundleListData.bundles[0].bundle_id

      // Run the continuity check
      const response = await fetch(`${apiBaseUrl}/api/cold-start-continuity/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bundleId,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const data = (await response.json()) as {
        success: boolean
        runId?: string
        verdict?: 'PASS' | 'FAIL'
        completedAt?: string
        failureReason?: string
        summary?: string
        baselineChecksums?: { content_checksum: string; bundle_checksum: string }
        rebuiltChecksums?: { content_checksum: string; bundle_checksum: string } | null
        comparisons?: { content_checksum_match: boolean; bundle_checksum_match: boolean }
        error?: string
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to run continuity check')
      }

      // Create result object
      const result: ContinuityCheckResult = {
        runId: data.runId || crypto.randomUUID(),
        bundleId,
        receiptId: null,
        ticketId: ticketId || '',
        role: 'implementation-agent', // Default, could be enhanced
        verdict: data.verdict || 'FAIL',
        completedAt: data.completedAt || new Date().toISOString(),
        failureReason: data.failureReason || null,
        summary: data.summary || 'Check completed',
        baselineChecksums: data.baselineChecksums || { content_checksum: '', bundle_checksum: '' },
        rebuiltChecksums: data.rebuiltChecksums || null,
        comparisons: data.comparisons || { content_checksum_match: false, bundle_checksum_match: false },
      }

      setLatestResult(result)
      // Reload history to include the new result
      await loadHistory()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run continuity check')
    } finally {
      setRunning(false)
    }
  }

  const formatTimestamp = (timestamp: string): string => {
    return new Date(timestamp).toLocaleString()
  }

  const getFailureReasonLabel = (reason: string | null): string => {
    if (!reason) return 'Unknown'
    const labels: Record<string, string> = {
      missing_receipt: 'Missing Receipt',
      checksum_mismatch: 'Checksum Mismatch',
      missing_manifest_reference: 'Missing Manifest Reference',
      artifact_version_mismatch: 'Artifact Version Mismatch',
    }
    return labels[reason] || reason
  }

  if (!isOpen) return null

  const displayResult = selectedHistoryItem || latestResult

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: '900px', maxHeight: '90vh', width: '95%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Cold-start Continuity Diagnostics</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'auto' }}>
          {!supabaseUrl || !supabaseAnonKey ? (
            <div style={{ padding: '16px', background: 'var(--hal-surface-alt)', borderRadius: '8px' }}>
              <p>Supabase connection required to run continuity checks.</p>
            </div>
          ) : !repoFullName || (!ticketPk && !ticketId) ? (
            <div style={{ padding: '16px', background: 'var(--hal-surface-alt)', borderRadius: '8px' }}>
              <p>Repository and ticket selection required to run continuity checks.</p>
            </div>
          ) : (
            <>
              {/* Run Button */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={runCheck}
                  disabled={running}
                  style={{
                    padding: '10px 20px',
                    fontSize: '16px',
                    fontWeight: '600',
                    background: running ? 'var(--hal-border)' : 'var(--hal-primary)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: running ? 'not-allowed' : 'pointer',
                  }}
                >
                  {running ? 'Running...' : 'Run Cold-start Continuity Check'}
                </button>
                {running && (
                  <span style={{ fontSize: '14px', color: 'var(--hal-text-secondary)' }}>
                    Rebuilding bundle and comparing checksums...
                  </span>
                )}
              </div>

              {error && (
                <div style={{ padding: '12px', background: 'var(--hal-error-bg)', color: 'var(--hal-error)', borderRadius: '6px' }}>
                  {error}
                </div>
              )}

              {/* Latest Result */}
              {displayResult && (
                <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Latest Result</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                      <strong>Verdict:</strong>
                      <span
                        style={{
                          padding: '4px 12px',
                          borderRadius: '4px',
                          fontWeight: '600',
                          background: displayResult.verdict === 'PASS' ? 'var(--hal-success-bg)' : 'var(--hal-error-bg)',
                          color: displayResult.verdict === 'PASS' ? 'var(--hal-success)' : 'var(--hal-error)',
                        }}
                      >
                        {displayResult.verdict}
                      </span>
                    </div>
                    <div>
                      <strong>Completed:</strong> {formatTimestamp(displayResult.completedAt)}
                    </div>
                    <div>
                      <strong>Run ID:</strong> <code style={{ fontSize: '12px' }}>{displayResult.runId}</code>
                    </div>
                    <div>
                      <strong>Summary:</strong> {displayResult.summary}
                    </div>
                    {displayResult.verdict === 'FAIL' && displayResult.failureReason && (
                      <div>
                        <strong>Failure Reason:</strong>{' '}
                        <span style={{ color: 'var(--hal-error)' }}>{getFailureReasonLabel(displayResult.failureReason)}</span>
                      </div>
                    )}
                    {displayResult.comparisons && (
                      <div style={{ marginTop: '8px', padding: '12px', background: 'var(--hal-surface-alt)', borderRadius: '6px' }}>
                        <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Checksum Comparisons</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                          <div>
                            Content Checksum Match:{' '}
                            <span style={{ color: displayResult.comparisons.content_checksum_match ? 'var(--hal-success)' : 'var(--hal-error)' }}>
                              {displayResult.comparisons.content_checksum_match ? '✓ Match' : '✗ Mismatch'}
                            </span>
                          </div>
                          <div>
                            Bundle Checksum Match:{' '}
                            <span style={{ color: displayResult.comparisons.bundle_checksum_match ? 'var(--hal-success)' : 'var(--hal-error)' }}>
                              {displayResult.comparisons.bundle_checksum_match ? '✓ Match' : '✗ Mismatch'}
                            </span>
                          </div>
                          {displayResult.baselineChecksums && (
                            <div style={{ marginTop: '8px' }}>
                              <div style={{ fontWeight: '600' }}>Baseline Checksums:</div>
                              <div style={{ fontFamily: 'monospace', fontSize: '11px', wordBreak: 'break-all' }}>
                                Content: {displayResult.baselineChecksums.content_checksum.substring(0, 32)}...
                              </div>
                              <div style={{ fontFamily: 'monospace', fontSize: '11px', wordBreak: 'break-all' }}>
                                Bundle: {displayResult.baselineChecksums.bundle_checksum.substring(0, 32)}...
                              </div>
                            </div>
                          )}
                          {displayResult.rebuiltChecksums && (
                            <div style={{ marginTop: '8px' }}>
                              <div style={{ fontWeight: '600' }}>Rebuilt Checksums:</div>
                              <div style={{ fontFamily: 'monospace', fontSize: '11px', wordBreak: 'break-all' }}>
                                Content: {displayResult.rebuiltChecksums.content_checksum.substring(0, 32)}...
                              </div>
                              <div style={{ fontFamily: 'monospace', fontSize: '11px', wordBreak: 'break-all' }}>
                                Bundle: {displayResult.rebuiltChecksums.bundle_checksum.substring(0, 32)}...
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* History List */}
              {history.length > 0 && (
                <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>History (Last 10 Runs)</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                    {history.map((item) => (
                      <div
                        key={item.runId}
                        onClick={() => setSelectedHistoryItem(item)}
                        style={{
                          padding: '12px',
                          background: selectedHistoryItem?.runId === item.runId ? 'var(--hal-surface-alt)' : 'transparent',
                          border: '1px solid var(--hal-border)',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          transition: 'background 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          if (selectedHistoryItem?.runId !== item.runId) {
                            e.currentTarget.style.background = 'var(--hal-surface-alt)'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (selectedHistoryItem?.runId !== item.runId) {
                            e.currentTarget.style.background = 'transparent'
                          }
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '12px',
                                fontWeight: '600',
                                background: item.verdict === 'PASS' ? 'var(--hal-success-bg)' : 'var(--hal-error-bg)',
                                color: item.verdict === 'PASS' ? 'var(--hal-success)' : 'var(--hal-error)',
                              }}
                            >
                              {item.verdict}
                            </span>
                            <span style={{ fontSize: '14px' }}>{formatTimestamp(item.completedAt)}</span>
                          </div>
                          {item.failureReason && (
                            <span style={{ fontSize: '12px', color: 'var(--hal-text-secondary)' }}>
                              {getFailureReasonLabel(item.failureReason)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {history.length === 0 && !running && (
                <div style={{ padding: '16px', background: 'var(--hal-surface-alt)', borderRadius: '8px', textAlign: 'center' }}>
                  <p style={{ margin: 0, color: 'var(--hal-text-secondary)' }}>No continuity checks run yet. Click "Run Cold-start Continuity Check" to start.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
