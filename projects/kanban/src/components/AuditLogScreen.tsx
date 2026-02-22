import { useState, useEffect, useCallback } from 'react'

interface AuditLogEntry {
  id: string
  project_id: string
  action_type: string
  status: 'succeeded' | 'failed' | 'pending'
  summary: string
  details: unknown
  error_message: string | null
  created_at: string
}

interface AuditLogScreenProps {
  projectId: string
  supabaseUrl: string
  supabaseAnonKey: string
  apiBaseUrl: string
  onClose?: () => void
}

export function AuditLogScreen({
  projectId,
  supabaseUrl,
  supabaseAnonKey,
  apiBaseUrl,
  onClose,
}: AuditLogScreenProps) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null)

  const loadAuditLog = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(`${apiBaseUrl}/api/audit-log/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          limit: 100,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const result = await response.json()

      if (!result.success) {
        setError(result.error || 'Failed to load audit log')
        setLoading(false)
        return
      }

      setEntries(result.entries || [])
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit log')
      setLoading(false)
    }
  }, [projectId, supabaseUrl, supabaseAnonKey, apiBaseUrl])

  useEffect(() => {
    loadAuditLog()
  }, [loadAuditLog])

  const getActionTypeLabel = (actionType: string): string => {
    const labels: Record<string, string> = {
      provider_connect: 'Provider Connected',
      provider_disconnect: 'Provider Disconnected',
      provider_revoke: 'Provider Revocation',
      bootstrap_start: 'Bootstrap Started',
      bootstrap_step: 'Bootstrap Step',
    }
    return labels[actionType] || actionType.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
  }

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'succeeded':
        return '#4caf50'
      case 'failed':
        return '#f44336'
      case 'pending':
        return '#ff9800'
      default:
        return '#9e9e9e'
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-label="Audit Log">
      <div className="modal" style={{ maxWidth: '1000px' }}>
        <div className="modal-header">
          <h2 className="modal-title">Audit Log</h2>
          {onClose && (
            <button type="button" className="modal-close btn-destructive" onClick={onClose}>
              Close
            </button>
          )}
        </div>

        <p className="modal-subtitle">View bootstrap and infrastructure actions for this project.</p>

        {error && (
          <div className="wizard-error" role="alert" style={{ marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        {loading && <div style={{ padding: '1rem' }}>Loading audit log...</div>}

        {!loading && entries.length === 0 && (
          <div style={{ padding: '1rem', textAlign: 'center', color: '#666' }}>No audit log entries yet.</div>
        )}

        {!loading && entries.length > 0 && (
          <div style={{ marginTop: '1rem' }}>
            {entries.map((entry) => (
              <div
                key={entry.id}
                style={{
                  padding: '1rem',
                  marginBottom: '0.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  background: entry.status === 'failed' ? '#ffebee' : '#fff',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                      <strong>{getActionTypeLabel(entry.action_type)}</strong>
                      <span
                        style={{
                          padding: '0.25rem 0.5rem',
                          background: getStatusColor(entry.status),
                          color: 'white',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                        }}
                      >
                        {entry.status}
                      </span>
                      <span style={{ color: '#666', fontSize: '0.85rem' }}>
                        {new Date(entry.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div style={{ marginBottom: '0.5rem' }}>{entry.summary}</div>
                    {entry.error_message && (
                      <div style={{ padding: '0.75rem', background: '#fff3cd', borderRadius: '4px', marginBottom: '0.5rem' }}>
                        <strong>Error:</strong> {entry.error_message}
                      </div>
                    )}
                    {entry.details && (
                      <div>
                        <button
                          type="button"
                          className="btn-standard"
                          onClick={() => setExpandedEntryId(expandedEntryId === entry.id ? null : entry.id)}
                          style={{ fontSize: '0.85rem' }}
                        >
                          {expandedEntryId === entry.id ? 'Hide' : 'Show'} details
                        </button>
                        {expandedEntryId === entry.id && (
                          <pre
                            style={{
                              marginTop: '0.5rem',
                              padding: '0.75rem',
                              background: '#f5f5f5',
                              borderRadius: '4px',
                              fontSize: '0.85rem',
                              overflow: 'auto',
                              maxHeight: '200px',
                            }}
                          >
                            {JSON.stringify(entry.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
