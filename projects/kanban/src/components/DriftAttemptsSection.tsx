import React, { useState, useEffect } from 'react'

interface DriftAttempt {
  id: string
  ticket_pk: string
  transition: string
  attempted_at: string
  pr_url: string | null
  pr_number: number | null
  evaluated_head_sha: string | null
  head_sha: string | null
  overall_status: 'passing' | 'failing' | 'pending' | 'running' | 'unknown' | null
  required_checks: any
  failing_check_names: string[] | null
  checks_page_url: string | null
  evaluation_error: string | null
  reason_types: string[] | null
  reason_messages: string[] | null
  references: any
  blocked: boolean
  created_at: string
}

interface DriftAttemptsSectionProps {
  ticketPk: string
  supabaseUrl: string
  supabaseKey: string
  columnId: string | null
}

const TRANSITION_NAMES: Record<string, string> = {
  'col-qa': 'Ready for QA',
  'col-human-in-the-loop': 'Human in the Loop',
  'col-process-review': 'Process Review',
  'col-done': 'Done',
}

function getTransitionName(transition: string): string {
  return TRANSITION_NAMES[transition] || transition
}

function getStatusDisplay(status: string | null, blocked: boolean): { text: string; className: string } {
  if (blocked) {
    return { text: 'Fail', className: 'drift-status-fail' }
  }
  if (status === 'passing') {
    return { text: 'Pass', className: 'drift-status-pass' }
  }
  if (status === 'failing') {
    return { text: 'Fail', className: 'drift-status-fail' }
  }
  if (status === 'pending' || status === 'running') {
    return { text: status === 'pending' ? 'Pending' : 'Running', className: 'drift-status-pending' }
  }
  return { text: 'Unknown', className: 'drift-status-unknown' }
}

export function DriftAttemptsSection({ ticketPk, supabaseUrl, supabaseKey, columnId }: DriftAttemptsSectionProps) {
  const [attempts, setAttempts] = useState<DriftAttempt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!ticketPk || !supabaseUrl || !supabaseKey) {
      setLoading(false)
      return
    }

    const fetchAttempts = async () => {
      try {
        setLoading(true)
        setError(null)

        const apiBaseUrl = import.meta.env.VITE_HAL_API_BASE_URL || window.location.origin
        const response = await fetch(`${apiBaseUrl}/api/drift-attempts/get`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketPk,
            limit: 20, // Show last 20 attempts
            supabaseUrl,
            supabaseAnonKey: supabaseKey,
          }),
        })

        const result = await response.json()

        if (!result.success) {
          setError(result.error || 'Failed to fetch drift attempts')
          setAttempts([])
          return
        }

        setAttempts(result.attempts || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setAttempts([])
      } finally {
        setLoading(false)
      }
    }

    fetchAttempts()
  }, [ticketPk, supabaseUrl, supabaseKey])

  // Filter attempts for current transition if columnId is provided
  const relevantAttempts = columnId
    ? attempts.filter((a) => a.transition === columnId)
    : attempts

  // Get latest attempt
  const latestAttempt = relevantAttempts.length > 0 ? relevantAttempts[0] : null

  // Only show section if there are attempts or we're in a drift-gated column
  const driftGatedColumns = ['col-qa', 'col-human-in-the-loop', 'col-process-review', 'col-done']
  const shouldShow = columnId && driftGatedColumns.includes(columnId) && (relevantAttempts.length > 0 || loading)

  if (!shouldShow) {
    return null
  }

  if (loading) {
    return (
      <div className="ticket-detail-section">
        <h3 className="ticket-detail-section-title">Drift Check Status</h3>
        <p className="ticket-detail-loading">Loading drift attempts...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="ticket-detail-section">
        <h3 className="ticket-detail-section-title">Drift Check Status</h3>
        <p className="ticket-detail-error" style={{ fontSize: '0.9em' }}>
          Error loading drift attempts: {error}
        </p>
      </div>
    )
  }

  const latestStatus = latestAttempt ? getStatusDisplay(latestAttempt.overall_status, latestAttempt.blocked) : null

  return (
    <div className="ticket-detail-section">
      <h3 className="ticket-detail-section-title">Drift Check Status</h3>

      {/* Current attempt result */}
      {latestAttempt && (
        <div
          className={`drift-current-attempt ${latestAttempt.blocked ? 'drift-current-fail' : latestAttempt.overall_status === 'passing' ? 'drift-current-pass' : ''}`}
          style={{
            padding: '12px',
            borderRadius: '4px',
            marginBottom: '16px',
            backgroundColor: latestAttempt.blocked
              ? 'rgba(220, 53, 69, 0.1)'
              : latestAttempt.overall_status === 'passing'
              ? 'rgba(40, 167, 69, 0.1)'
              : 'rgba(255, 193, 7, 0.1)',
            border: `1px solid ${
              latestAttempt.blocked
                ? 'rgba(220, 53, 69, 0.3)'
                : latestAttempt.overall_status === 'passing'
                ? 'rgba(40, 167, 69, 0.3)'
                : 'rgba(255, 193, 7, 0.3)'
            }`,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <strong>Current Attempt:</strong>
            <span className={latestStatus?.className} style={{ fontWeight: 'bold' }}>
              {latestStatus?.text}
            </span>
          </div>
          <div style={{ fontSize: '0.9em', color: '#666' }}>
            {new Date(latestAttempt.attempted_at).toLocaleString()}
          </div>
          {latestAttempt.blocked && latestAttempt.reason_messages && latestAttempt.reason_messages.length > 0 && (
            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(220, 53, 69, 0.2)' }}>
              <strong style={{ display: 'block', marginBottom: '4px' }}>Failure Reasons:</strong>
              <ul style={{ margin: 0, paddingLeft: '20px' }}>
                {latestAttempt.reason_messages.map((msg, idx) => (
                  <li key={idx} style={{ marginBottom: '4px' }}>
                    {msg}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Recent drift attempts */}
      {relevantAttempts.length > 0 && (
        <div className="drift-attempts-history">
          <h4 style={{ fontSize: '1em', marginBottom: '8px', fontWeight: '600' }}>Recent Drift Attempts</h4>
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #ddd' }}>
                  <th style={{ textAlign: 'left', padding: '8px' }}>Timestamp</th>
                  <th style={{ textAlign: 'left', padding: '8px' }}>Transition</th>
                  <th style={{ textAlign: 'left', padding: '8px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {relevantAttempts.map((attempt) => {
                  const status = getStatusDisplay(attempt.overall_status, attempt.blocked)
                  return (
                    <tr
                      key={attempt.id}
                      style={{
                        borderBottom: '1px solid #eee',
                        backgroundColor: attempt.id === latestAttempt?.id ? 'rgba(255, 193, 7, 0.05)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '8px' }}>{new Date(attempt.attempted_at).toLocaleString()}</td>
                      <td style={{ padding: '8px' }}>{getTransitionName(attempt.transition)}</td>
                      <td style={{ padding: '8px' }}>
                        <span className={status.className} style={{ fontWeight: attempt.id === latestAttempt?.id ? 'bold' : 'normal' }}>
                          {status.text}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {relevantAttempts.length === 0 && (
        <p style={{ fontSize: '0.9em', color: '#666', fontStyle: 'italic' }}>No drift attempts recorded yet.</p>
      )}
    </div>
  )
}
