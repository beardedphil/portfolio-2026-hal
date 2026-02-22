import { useState, useEffect } from 'react'

interface Failure {
  id: string
  failure_type: string
  root_cause: string | null
  prevention_candidate: string | null
  recurrence_count: number
  first_seen_at: string
  last_seen_at: string
  references: Record<string, unknown> | null
}

interface FailuresModalProps {
  isOpen: boolean
  onClose: () => void
  supabaseUrl: string | null
  supabaseAnonKey: string | null
}

export function FailuresModal({ isOpen, onClose, supabaseUrl, supabaseAnonKey }: FailuresModalProps) {
  const [failures, setFailures] = useState<Failure[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFailure, setSelectedFailure] = useState<Failure | null>(null)

  useEffect(() => {
    if (!isOpen) {
      setFailures([])
      setSelectedFailure(null)
      setError(null)
      return
    }

    async function loadFailures() {
      if (!supabaseUrl || !supabaseAnonKey) {
        setError('Supabase not configured')
        return
      }

      setLoading(true)
      setError(null)

      try {
        const res = await fetch('/api/failures/list', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            limit: 1000,
            supabaseUrl,
            supabaseAnonKey,
          }),
        })

        const data = (await res.json().catch(() => ({}))) as {
          success?: boolean
          failures?: Failure[]
          error?: string
        }

        if (!res.ok || !data.success) {
          throw new Error(data.error || `Failed to load failures (HTTP ${res.status})`)
        }

        setFailures(data.failures || [])
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    }

    loadFailures()
  }, [isOpen, supabaseUrl, supabaseAnonKey])

  if (!isOpen) return null

  return (
    <div className="conversation-modal-overlay" onClick={onClose}>
      <div className="conversation-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px', width: '90vw' }}>
        <div className="conversation-modal-header">
          <h3>Failures Library</h3>
          <button
            type="button"
            className="conversation-modal-close btn-destructive"
            onClick={onClose}
            aria-label="Close failures modal"
          >
            ×
          </button>
        </div>

        <div className="conversation-modal-content" style={{ padding: '24px', maxHeight: '80vh', overflow: 'auto' }}>
          {loading && <div style={{ padding: '20px', textAlign: 'center' }}>Loading failures...</div>}

          {error && (
            <div
              style={{
                marginBottom: '20px',
                padding: '16px',
                background: 'var(--hal-status-error, #c62828)',
                color: 'white',
                borderRadius: '8px',
              }}
            >
              <p style={{ margin: 0, fontWeight: '600' }}>Error loading failures</p>
              <p style={{ margin: '8px 0 0 0', fontSize: '14px', opacity: 0.9 }}>{error}</p>
            </div>
          )}

          {!loading && !error && failures.length === 0 && (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--hal-text-muted)' }}>
              <p style={{ fontSize: '18px', marginBottom: '8px' }}>No failures recorded yet</p>
              <p style={{ fontSize: '14px' }}>
                When failures occur (drift gate blocks, agent run failures, etc.), they will appear here with root cause
                analysis and prevention candidates.
              </p>
            </div>
          )}

          {!loading && !error && failures.length > 0 && !selectedFailure && (
            <div>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '14px',
                }}
              >
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--hal-border, #333)' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>Type</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>Recurrences</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>First Seen</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {failures.map((failure) => (
                    <tr
                      key={failure.id}
                      style={{
                        borderBottom: '1px solid var(--hal-border, #333)',
                        cursor: 'pointer',
                      }}
                      onClick={() => setSelectedFailure(failure)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--hal-bg-hover, rgba(255, 255, 255, 0.05))'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      <td style={{ padding: '12px' }}>{failure.failure_type}</td>
                      <td style={{ padding: '12px' }}>{failure.recurrence_count}</td>
                      <td style={{ padding: '12px' }}>
                        {new Date(failure.first_seen_at).toLocaleString()}
                      </td>
                      <td style={{ padding: '12px' }}>
                        {new Date(failure.last_seen_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {selectedFailure && (
            <div>
              <button
                type="button"
                className="btn-standard"
                onClick={() => setSelectedFailure(null)}
                style={{ marginBottom: '20px' }}
              >
                ← Back to list
              </button>

              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ marginBottom: '8px' }}>Failure Type</h4>
                <p style={{ margin: 0, padding: '12px', background: 'var(--hal-bg-secondary, #1a1a1a)', borderRadius: '4px' }}>
                  {selectedFailure.failure_type}
                </p>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ marginBottom: '8px' }}>Root Cause</h4>
                <p
                  style={{
                    margin: 0,
                    padding: '12px',
                    background: 'var(--hal-bg-secondary, #1a1a1a)',
                    borderRadius: '4px',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {selectedFailure.root_cause || '(No root cause recorded)'}
                </p>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ marginBottom: '8px' }}>Prevention Candidate</h4>
                <p
                  style={{
                    margin: 0,
                    padding: '12px',
                    background: 'var(--hal-bg-secondary, #1a1a1a)',
                    borderRadius: '4px',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {selectedFailure.prevention_candidate || '(No prevention candidate recorded)'}
                </p>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ marginBottom: '8px' }}>Recurrence Info</h4>
                <div style={{ padding: '12px', background: 'var(--hal-bg-secondary, #1a1a1a)', borderRadius: '4px' }}>
                  <p style={{ margin: '0 0 8px 0' }}>
                    <strong>Count:</strong> {selectedFailure.recurrence_count} occurrence{selectedFailure.recurrence_count !== 1 ? 's' : ''}
                  </p>
                  <p style={{ margin: '0 0 8px 0' }}>
                    <strong>First seen:</strong> {new Date(selectedFailure.first_seen_at).toLocaleString()}
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong>Last seen:</strong> {new Date(selectedFailure.last_seen_at).toLocaleString()}
                  </p>
                </div>
              </div>

              {selectedFailure.references && Object.keys(selectedFailure.references).length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ marginBottom: '8px' }}>References</h4>
                  <pre
                    style={{
                      margin: 0,
                      padding: '12px',
                      background: 'var(--hal-bg-secondary, #1a1a1a)',
                      borderRadius: '4px',
                      fontSize: '12px',
                      overflow: 'auto',
                    }}
                  >
                    {JSON.stringify(selectedFailure.references, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
