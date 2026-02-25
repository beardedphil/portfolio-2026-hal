import { useState, useEffect, useCallback } from 'react'

interface AuditLogViewProps {
  isOpen: boolean
  onClose: () => void
  projectId: string
  supabaseUrl: string
  supabaseAnonKey: string
  apiBaseUrl: string
}

interface AuditLogEntry {
  id: string
  project_id: string
  action_type: string
  status: 'succeeded' | 'failed' | 'pending'
  summary: string
  metadata: Record<string, unknown>
  created_at: string
  actor?: string | null
}

// Redaction utility to ensure secrets are never displayed in audit logs
const REDACTED = '[REDACTED]'
const OPENAI_KEY_PATTERN = /sk-[a-zA-Z0-9_-]{20,}/g
const JWT_PATTERN = /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g
const SUPABASE_URL_PATTERN = /https:\/\/([a-zA-Z0-9-]+\.)?supabase\.co(\/[a-zA-Z0-9_-]*)*/gi
const SENSITIVE_KEYS = /^(api[_-]?key|apikey|authorization|secret|password|token|access[_-]?token|refresh[_-]?token|supabase[_-]?(anon|service)[_-]?key|client[_-]?secret|oauth[_-]?token)$/i

function redactString(value: string): string {
  return value
    .replace(OPENAI_KEY_PATTERN, REDACTED)
    .replace(JWT_PATTERN, REDACTED)
    .replace(SUPABASE_URL_PATTERN, REDACTED)
}

function redactValue(value: unknown, key?: string): unknown {
  if (key && typeof value === 'string' && SENSITIVE_KEYS.test(key)) {
    return REDACTED
  }
  if (typeof value === 'string') {
    return redactString(value)
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactValue(v))
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = redactValue(v, k)
    }
    return out
  }
  return value
}

function redactMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  return redactValue(metadata) as Record<string, unknown>
}

export function AuditLogView({
  isOpen,
  onClose,
  projectId,
  supabaseUrl,
  supabaseAnonKey,
  apiBaseUrl,
}: AuditLogViewProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterActionType, setFilterActionType] = useState<string>('')

  const loadAuditLogs = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`${apiBaseUrl}/api/audit-logs/get`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          projectId,
          supabaseUrl,
          supabaseAnonKey,
          limit: 100,
          ...(filterActionType ? { actionType: filterActionType } : {}),
        }),
      })

      const result = await response.json()

      if (!result.success) {
        setError(result.error || 'Failed to load audit logs')
        setLogs([])
        return
      }

      setLogs(result.logs || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs')
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [apiBaseUrl, projectId, supabaseUrl, supabaseAnonKey, filterActionType])

  useEffect(() => {
    if (isOpen) {
      loadAuditLogs()
    }
  }, [isOpen, loadAuditLogs])

  const formatTimestamp = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleString()
    } catch {
      return timestamp
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'succeeded':
        return 'green'
      case 'failed':
        return 'red'
      case 'pending':
        return 'orange'
      default:
        return 'gray'
    }
  }

  const getActionTypeLabel = (actionType: string) => {
    return actionType
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  // Get unique action types for filter
  const actionTypes = Array.from(new Set(logs.map((log) => log.action_type))).sort()

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '800px', maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Audit Log</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          {error && (
            <div className="error-message" style={{ marginBottom: '1rem' }}>
              <strong>Error:</strong> {error}
            </div>
          )}

          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="action-type-filter" style={{ marginRight: '0.5rem' }}>
              Filter by action type:
            </label>
            <select
              id="action-type-filter"
              value={filterActionType}
              onChange={(e) => setFilterActionType(e.target.value)}
              style={{ padding: '0.25rem' }}
            >
              <option value="">All actions</option>
              {actionTypes.map((actionType) => (
                <option key={actionType} value={actionType}>
                  {getActionTypeLabel(actionType)}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <p>Loading audit logs...</p>
          ) : logs.length === 0 ? (
            <p>No audit log entries found.</p>
          ) : (
            <div className="audit-log-list">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="audit-log-entry"
                  style={{
                    marginBottom: '1rem',
                    padding: '1rem',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    backgroundColor: '#f9f9f9',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                    <div>
                      <strong>{getActionTypeLabel(log.action_type)}</strong>
                      <span
                        style={{
                          marginLeft: '0.5rem',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          backgroundColor: getStatusColor(log.status),
                          color: 'white',
                          fontSize: '0.85em',
                        }}
                      >
                        {log.status.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.9em', color: '#666' }}>{formatTimestamp(log.created_at)}</div>
                  </div>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <strong>Summary:</strong> {log.summary}
                  </div>
                  {log.actor && (
                    <div style={{ marginBottom: '0.5rem', fontSize: '0.9em', color: '#666' }}>
                      <strong>Actor:</strong> {log.actor}
                    </div>
                  )}
                  {Object.keys(log.metadata || {}).length > 0 && (
                    <details style={{ marginTop: '0.5rem' }}>
                      <summary style={{ cursor: 'pointer', fontSize: '0.9em', color: '#666' }}>Metadata</summary>
                      <pre style={{ marginTop: '0.5rem', padding: '0.5rem', backgroundColor: '#fff', borderRadius: '4px', fontSize: '0.85em', overflow: 'auto' }}>
                        {JSON.stringify(redactMetadata(log.metadata || {}), null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
            <button type="button" className="btn-standard" onClick={loadAuditLogs} disabled={loading}>
              Refresh
            </button>
            <button type="button" className="btn-standard" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
