import { useState, useEffect, useCallback } from 'react'

interface AuditLogEntry {
  id: string
  project_id: string
  action_type: string
  action_status: string
  summary: string
  details: unknown | null
  provider_name: string | null
  related_entity_id: string | null
  created_at: string
}

interface AuditLogViewProps {
  projectId: string
  supabaseUrl: string
  supabaseAnonKey: string
  apiBaseUrl: string
  onClose?: () => void
}

export function AuditLogView({
  projectId,
  supabaseUrl,
  supabaseAnonKey,
  apiBaseUrl,
  onClose,
}: AuditLogViewProps) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterActionType, setFilterActionType] = useState<string>('')

  const loadEntries = useCallback(async () => {
    try {
      setError(null)
      setLoading(true)
      const response = await fetch(`${apiBaseUrl}/api/audit-log/get`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          actionType: filterActionType || undefined,
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
  }, [projectId, supabaseUrl, supabaseAnonKey, apiBaseUrl, filterActionType])

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  const formatActionType = (actionType: string): string => {
    return actionType
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
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

  // Get unique action types for filter
  const actionTypes = Array.from(new Set(entries.map((e) => e.action_type))).sort()

  return (
    <div className="modal-backdrop" role="dialog" aria-label="Audit log view">
      <div className="modal" style={{ maxWidth: '1000px' }}>
        <div className="modal-header">
          <h2 className="modal-title">Audit Log</h2>
          {onClose && (
            <button type="button" className="modal-close btn-destructive" onClick={onClose}>
              Close
            </button>
          )}
        </div>

        <p className="modal-subtitle">View bootstrap and infrastructure actions for this project</p>

        {error && (
          <div className="wizard-error" role="alert" style={{ marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        {/* Filter */}
        {actionTypes.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="action-type-filter" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Filter by action type:
            </label>
            <select
              id="action-type-filter"
              value={filterActionType}
              onChange={(e) => setFilterActionType(e.target.value)}
              style={{
                padding: '0.5rem',
                borderRadius: '4px',
                border: '1px solid #ddd',
                fontSize: '1rem',
                minWidth: '200px',
              }}
            >
              <option value="">All actions</option>
              {actionTypes.map((actionType) => (
                <option key={actionType} value={actionType}>
                  {formatActionType(actionType)}
                </option>
              ))}
            </select>
          </div>
        )}

        {loading && !entries.length && (
          <div style={{ padding: '2rem', textAlign: 'center' }}>Loading audit log...</div>
        )}

        {!loading && entries.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
            No audit log entries found for this project.
          </div>
        )}

        {!loading && entries.length > 0 && (
          <div
            style={{
              maxHeight: '600px',
              overflowY: 'auto',
              border: '1px solid #ddd',
              borderRadius: '4px',
              padding: '0.5rem',
            }}
          >
            {entries.map((entry) => (
              <div
                key={entry.id}
                style={{
                  padding: '1rem',
                  marginBottom: '0.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  background: '#fff',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <strong>{formatActionType(entry.action_type)}</strong>
                      {entry.provider_name && (
                        <span
                          style={{
                            padding: '0.25rem 0.5rem',
                            background: '#e3f2fd',
                            color: '#1976d2',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                          }}
                        >
                          {entry.provider_name}
                        </span>
                      )}
                      <span
                        style={{
                          padding: '0.25rem 0.5rem',
                          background: getStatusColor(entry.action_status),
                          color: 'white',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                        }}
                      >
                        {entry.action_status}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.5rem' }}>
                      {entry.summary}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#999' }}>
                      {new Date(entry.created_at).toLocaleString()}
                    </div>
                    {entry.details && typeof entry.details === 'object' && Object.keys(entry.details).length > 0 && (
                      <details style={{ marginTop: '0.5rem' }}>
                        <summary style={{ cursor: 'pointer', fontSize: '0.85rem', color: '#666' }}>View details</summary>
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
                      </details>
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
