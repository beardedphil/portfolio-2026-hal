import { useState, useEffect, useRef } from 'react'

interface ColdStartContinuityModalProps {
  isOpen: boolean
  onClose: () => void
  ticketPk: string | null
  ticketId: string | null
  repoFullName: string | null
  role: string | null
  supabaseUrl: string | null
  supabaseAnonKey: string | null
}

interface CheckResult {
  runId: string
  verdict: 'PASS' | 'FAIL'
  failureReason?: 'missing_receipt' | 'checksum_mismatch' | 'missing_manifest_reference' | 'artifact_version_mismatch'
  completedAt: string
  summary: string
  comparisonDetails?: {
    contentChecksumsMatch?: boolean
    bundleChecksumsMatch?: boolean
    manifestReferenceMatch?: boolean
    redReferenceMatch?: boolean
    baselineContentChecksum?: string
    rebuiltContentChecksum?: string
    baselineBundleChecksum?: string
    rebuiltBundleChecksum?: string
    baselineManifestRef?: unknown
    rebuiltManifestRef?: unknown
    baselineRedRef?: unknown
    rebuiltRedRef?: unknown
  }
}

interface CheckHistoryItem {
  runId: string
  verdict: 'PASS' | 'FAIL'
  failureReason?: 'missing_receipt' | 'checksum_mismatch' | 'missing_manifest_reference' | 'artifact_version_mismatch'
  completedAt: string
  summary: string
}

type RoleOption = 'project-manager' | 'implementation-agent' | 'qa-agent'

const ROLE_OPTIONS: Array<{ value: RoleOption; label: string }> = [
  { value: 'project-manager', label: 'PM' },
  { value: 'implementation-agent', label: 'Dev' },
  { value: 'qa-agent', label: 'QA' },
]


export function ColdStartContinuityModal({
  isOpen,
  onClose,
  ticketPk: initialTicketPk,
  ticketId: initialTicketId,
  repoFullName: initialRepoFullName,
  role: initialRole,
  supabaseUrl,
  supabaseAnonKey,
}: ColdStartContinuityModalProps) {
  const [ticketPk, setTicketPk] = useState<string | null>(initialTicketPk)
  const [ticketId, setTicketId] = useState<string | null>(initialTicketId)
  const [repoFullName, setRepoFullName] = useState<string | null>(initialRepoFullName)
  const [selectedRole, setSelectedRole] = useState<RoleOption>(
    (initialRole as RoleOption) || 'project-manager'
  )
  const [latestResult, setLatestResult] = useState<CheckResult | null>(null)
  const [history, setHistory] = useState<CheckHistoryItem[]>([])
  const [running, setRunning] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<CheckHistoryItem | null>(null)
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

  // Load history when modal opens
  useEffect(() => {
    if (!isOpen) return
    loadHistory()
  }, [isOpen, ticketPk, ticketId, repoFullName, selectedRole])

  async function loadHistory() {
    if (!ticketPk && !ticketId) {
      setLatestResult(null)
      setHistory([])
      return
    }

    if (!repoFullName || !selectedRole) {
      setLatestResult(null)
      setHistory([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      const apiBaseUrl = apiBaseUrlRef.current || window.location.origin
      const res = await fetch(`${apiBaseUrl}/api/cold-start-continuity/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketPk: ticketPk || undefined,
          ticketId: ticketId || undefined,
          repoFullName,
          role: selectedRole,
          limit: 10,
          supabaseUrl: supabaseUrl || undefined,
          supabaseAnonKey: supabaseAnonKey || undefined,
        }),
      })

      if (!res.ok) {
        throw new Error(`Failed to load history: ${res.statusText}`)
      }

      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error || 'Failed to load history')
      }

      setLatestResult(data.latest)
      setHistory(data.history || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history')
      setLatestResult(null)
      setHistory([])
    } finally {
      setLoading(false)
    }
  }

  async function runCheck() {
    if (!ticketPk && !ticketId) {
      setError('Ticket ID or PK is required')
      return
    }

    if (!repoFullName || !selectedRole) {
      setError('Repository and role are required')
      return
    }

    setRunning(true)
    setError(null)

    try {
      const apiBaseUrl = apiBaseUrlRef.current || window.location.origin
      const res = await fetch(`${apiBaseUrl}/api/cold-start-continuity/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketPk: ticketPk || undefined,
          ticketId: ticketId || undefined,
          repoFullName,
          role: selectedRole,
          supabaseUrl: supabaseUrl || undefined,
          supabaseAnonKey: supabaseAnonKey || undefined,
        }),
      })

      if (!res.ok) {
        throw new Error(`Failed to run check: ${res.statusText}`)
      }

      const data = await res.json()
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

  function formatTimestamp(isoString: string): string {
    try {
      const date = new Date(isoString)
      return date.toLocaleString()
    } catch {
      return isoString
    }
  }

  function getFailureReasonLabel(reason?: string): string {
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
        return 'Unknown'
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Cold-start continuity diagnostics</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-body">
          {/* Ticket selection */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Ticket ID:
            </label>
            <input
              type="text"
              value={ticketId || ''}
              onChange={(e) => setTicketId(e.target.value || null)}
              placeholder="e.g., HAL-0774"
              style={{ width: '100%', padding: '0.5rem', marginBottom: '0.5rem' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Repository:
            </label>
            <input
              type="text"
              value={repoFullName || ''}
              onChange={(e) => setRepoFullName(e.target.value || null)}
              placeholder="e.g., owner/repo"
              style={{ width: '100%', padding: '0.5rem', marginBottom: '0.5rem' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Role:
            </label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as RoleOption)}
              style={{ width: '100%', padding: '0.5rem' }}
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Run button */}
          <div style={{ marginBottom: '1.5rem' }}>
            <button
              onClick={runCheck}
              disabled={running || loading || !ticketId || !repoFullName}
              style={{
                width: '100%',
                padding: '0.75rem',
                fontSize: '1rem',
                fontWeight: 'bold',
                backgroundColor: running ? '#666' : '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: running ? 'not-allowed' : 'pointer',
              }}
            >
              {running ? 'Running...' : 'Run Cold-start continuity check'}
            </button>
          </div>

          {error && (
            <div
              style={{
                padding: '0.75rem',
                marginBottom: '1rem',
                backgroundColor: '#fee',
                color: '#c00',
                borderRadius: '4px',
              }}
            >
              {error}
            </div>
          )}

          {/* Latest result */}
          {loading && <div style={{ padding: '1rem', textAlign: 'center' }}>Loading...</div>}

          {!loading && latestResult && (
            <div
              style={{
                marginBottom: '1.5rem',
                padding: '1rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                backgroundColor: latestResult.verdict === 'PASS' ? '#efe' : '#fee',
              }}
            >
              <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Latest result</h3>
              <div style={{ marginBottom: '0.5rem' }}>
                <strong>Verdict:</strong>{' '}
                <span style={{ color: latestResult.verdict === 'PASS' ? '#0a0' : '#c00' }}>
                  {latestResult.verdict}
                </span>
              </div>
              {latestResult.failureReason && (
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Failure reason:</strong> {getFailureReasonLabel(latestResult.failureReason)}
                </div>
              )}
              <div style={{ marginBottom: '0.5rem' }}>
                <strong>Run ID:</strong> <code>{latestResult.runId}</code>
              </div>
              <div style={{ marginBottom: '0.5rem' }}>
                <strong>Completed:</strong> {formatTimestamp(latestResult.completedAt)}
              </div>
              <div style={{ marginBottom: '0.5rem' }}>
                <strong>Summary:</strong> {latestResult.summary}
              </div>
              {latestResult.comparisonDetails && (
                <details style={{ marginTop: '0.5rem' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
                    Comparison details
                  </summary>
                  <pre
                    style={{
                      marginTop: '0.5rem',
                      padding: '0.5rem',
                      backgroundColor: '#f5f5f5',
                      borderRadius: '4px',
                      overflow: 'auto',
                      fontSize: '0.85rem',
                    }}
                  >
                    {JSON.stringify(latestResult.comparisonDetails, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}

          {/* History */}
          {!loading && (history.length > 0 || latestResult) && (
            <div>
              <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>History (last 10 runs)</h3>
              {history.length === 0 && latestResult && (
                <div style={{ padding: '0.5rem', color: '#666' }}>No prior runs</div>
              )}
              {history.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {history.map((item) => (
                    <div
                      key={item.runId}
                      onClick={() => setSelectedHistoryItem(item)}
                      style={{
                        padding: '0.75rem',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        backgroundColor:
                          selectedHistoryItem?.runId === item.runId ? '#f0f0f0' : 'white',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong
                            style={{ color: item.verdict === 'PASS' ? '#0a0' : '#c00' }}
                          >
                            {item.verdict}
                          </strong>
                          {item.failureReason && (
                            <span style={{ marginLeft: '0.5rem', color: '#666' }}>
                              — {getFailureReasonLabel(item.failureReason)}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#666' }}>
                          {formatTimestamp(item.completedAt)}
                        </div>
                      </div>
                      {selectedHistoryItem?.runId === item.runId && (
                        <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #ddd' }}>
                          <div style={{ marginBottom: '0.25rem' }}>
                            <strong>Run ID:</strong> <code>{item.runId}</code>
                          </div>
                          <div>
                            <strong>Summary:</strong> {item.summary}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
