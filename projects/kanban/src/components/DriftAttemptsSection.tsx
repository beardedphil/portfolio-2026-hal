import { useState, useEffect } from 'react'

interface DriftAttempt {
  id: string
  ticket_pk: string
  transition: string | null
  attempted_at: string
  pr_url: string | null
  evaluated_head_sha: string | null
  overall_status: string | null
  required_checks: any
  failing_check_names: string[] | null
  checks_page_url: string | null
  evaluation_error: string | null
  failure_reasons: Array<{ type: string; message: string }> | null
  references: any
  blocked: boolean
  created_at: string
  passed: boolean
  failed: boolean
}

interface DriftAttemptsSectionProps {
  ticketId: string
  ticketPk?: string
  supabaseUrl: string
  supabaseKey: string
}

export function DriftAttemptsSection({ ticketId, ticketPk, supabaseUrl, supabaseKey }: DriftAttemptsSectionProps) {
  const [attempts, setAttempts] = useState<DriftAttempt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!ticketId && !ticketPk) {
      setLoading(false)
      return
    }

    const fetchAttempts = async () => {
      setLoading(true)
      setError(null)
      try {
        // Use HAL API base URL from environment or use current origin
        const apiBaseUrl = import.meta.env.VITE_HAL_API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '')
        
        const response = await fetch(`${apiBaseUrl}/api/drift-attempts/get`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketId: ticketPk ? undefined : ticketId,
            ticketPk: ticketPk || undefined,
            supabaseUrl,
            supabaseAnonKey: supabaseKey,
          }),
        })

        const result = await response.json()
        if (result.success) {
          setAttempts(result.attempts || [])
        } else {
          setError(result.error || 'Failed to fetch drift attempts')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch drift attempts')
        console.error('Error fetching drift attempts:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchAttempts()
  }, [ticketId, ticketPk, supabaseUrl, supabaseKey])

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleString()
  }

  const getStatusDisplay = (attempt: DriftAttempt) => {
    if (attempt.failed) {
      return { text: 'Fail', color: '#d32f2f', bgColor: 'rgba(211, 47, 47, 0.1)' }
    }
    if (attempt.passed) {
      return { text: 'Pass', color: '#2e7d32', bgColor: 'rgba(46, 125, 50, 0.1)' }
    }
    return { text: 'Unknown', color: '#666', bgColor: 'rgba(102, 102, 102, 0.1)' }
  }

  const latestAttempt = attempts.length > 0 ? attempts[0] : null
  const recentAttempts = attempts.slice(0, 10) // Show last 10 attempts

  if (loading) {
    return (
      <div className="ticket-detail-section">
        <h3 className="ticket-detail-section-title">Drift Check Attempts</h3>
        <p className="ticket-detail-section-loading">Loading...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="ticket-detail-section">
        <h3 className="ticket-detail-section-title">Drift Check Attempts</h3>
        <div className="ticket-detail-error" role="alert" style={{ marginBottom: '1rem' }}>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  if (attempts.length === 0) {
    return (
      <div className="ticket-detail-section">
        <h3 className="ticket-detail-section-title">Drift Check Attempts</h3>
        <p className="ticket-detail-section-empty">No drift check attempts recorded yet.</p>
      </div>
    )
  }

  return (
    <div className="ticket-detail-section">
      <h3 className="ticket-detail-section-title">Drift Check Attempts</h3>
      
      {/* Current attempt result */}
      {latestAttempt && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.5rem' }}>Latest Attempt</h4>
          <div
            style={{
              padding: '0.75rem',
              borderRadius: '4px',
              border: `2px solid ${getStatusDisplay(latestAttempt).color}`,
              backgroundColor: latestAttempt.failed ? 'rgba(211, 47, 47, 0.05)' : 'rgba(46, 125, 50, 0.05)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <span
                style={{
                  padding: '0.25rem 0.5rem',
                  borderRadius: '3px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: getStatusDisplay(latestAttempt).color,
                  backgroundColor: getStatusDisplay(latestAttempt).bgColor,
                }}
              >
                {getStatusDisplay(latestAttempt).text}
              </span>
              <span style={{ fontSize: '0.85rem', color: '#666' }}>
                {formatTimestamp(latestAttempt.attempted_at)}
              </span>
              {latestAttempt.transition && (
                <span style={{ fontSize: '0.85rem', color: '#666', marginLeft: 'auto' }}>
                  {latestAttempt.transition}
                </span>
              )}
            </div>
            
            {/* Failure reasons */}
            {latestAttempt.failed && latestAttempt.failure_reasons && latestAttempt.failure_reasons.length > 0 && (
              <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(0,0,0,0.1)' }}>
                <strong style={{ fontSize: '0.9rem', display: 'block', marginBottom: '0.5rem' }}>
                  Failure Reasons:
                </strong>
                <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.9rem' }}>
                  {latestAttempt.failure_reasons.map((reason, idx) => (
                    <li key={idx} style={{ marginBottom: '0.25rem' }}>
                      <strong>{reason.type}:</strong> {reason.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* CI status details */}
            {latestAttempt.overall_status && (
              <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(0,0,0,0.1)' }}>
                <div style={{ fontSize: '0.9rem' }}>
                  <strong>CI Status:</strong> {latestAttempt.overall_status}
                </div>
                {latestAttempt.evaluated_head_sha && (
                  <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
                    SHA: <code style={{ fontSize: '0.85em' }}>{latestAttempt.evaluated_head_sha.substring(0, 7)}</code>
                  </div>
                )}
                {latestAttempt.failing_check_names && latestAttempt.failing_check_names.length > 0 && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
                    <strong>Failing checks:</strong>
                    <ul style={{ margin: '0.25rem 0 0 1.25rem', padding: 0 }}>
                      {latestAttempt.failing_check_names.map((name, idx) => (
                        <li key={idx}>{name}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {latestAttempt.checks_page_url && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <a
                      href={latestAttempt.checks_page_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#0066cc', textDecoration: 'underline', fontSize: '0.9rem' }}
                    >
                      View checks on GitHub →
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recent drift attempts list */}
      {recentAttempts.length > 0 && (
        <div>
          <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.5rem' }}>Recent Attempts</h4>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {recentAttempts.map((attempt) => {
              const status = getStatusDisplay(attempt)
              const isLatest = attempt.id === latestAttempt?.id
              return (
                <div
                  key={attempt.id}
                  style={{
                    padding: '0.75rem',
                    marginBottom: '0.5rem',
                    borderRadius: '4px',
                    border: isLatest ? `2px solid ${status.color}` : `1px solid rgba(0,0,0,0.1)`,
                    backgroundColor: isLatest && attempt.failed ? 'rgba(211, 47, 47, 0.05)' : 'rgba(0,0,0,0.02)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '3px',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        color: status.color,
                        backgroundColor: status.bgColor,
                      }}
                    >
                      {status.text}
                    </span>
                    <span style={{ fontSize: '0.85rem', color: '#666' }}>
                      {formatTimestamp(attempt.attempted_at)}
                    </span>
                    {attempt.transition && (
                      <span style={{ fontSize: '0.85rem', color: '#666' }}>
                        {attempt.transition}
                      </span>
                    )}
                    {isLatest && (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.125rem 0.375rem',
                          borderRadius: '3px',
                          backgroundColor: '#ff9800',
                          color: '#fff',
                          fontWeight: 600,
                        }}
                      >
                        Latest
                      </span>
                    )}
                  </div>
                  {attempt.failed && attempt.failure_reasons && attempt.failure_reasons.length > 0 && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#666' }}>
                      {attempt.failure_reasons.slice(0, 2).map((reason, idx) => (
                        <div key={idx}>
                          {reason.type}: {reason.message}
                        </div>
                      ))}
                      {attempt.failure_reasons.length > 2 && (
                        <div>+ {attempt.failure_reasons.length - 2} more reason(s)</div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
