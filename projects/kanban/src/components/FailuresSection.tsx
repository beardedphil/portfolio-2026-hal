import React, { useState, useEffect, useCallback } from 'react'

interface Failure {
  id: string
  failure_type: string
  root_cause: string | null
  prevention_candidate: string | null
  recurrence_count: number
  first_seen_at: string
  last_seen_at: string
}

interface FailuresSectionProps {
  supabaseUrl: string | null
  supabaseAnonKey: string | null
}

export function FailuresSection({ supabaseUrl, supabaseAnonKey }: FailuresSectionProps) {
  const [failures, setFailures] = useState<Failure[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFailureId, setSelectedFailureId] = useState<string | null>(null)
  const [selectedFailure, setSelectedFailure] = useState<Failure | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)

  const fetchFailures = useCallback(async () => {
    if (!supabaseUrl || !supabaseAnonKey) {
      setError('Supabase credentials not configured')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const baseUrl = window.location.origin
      const response = await fetch(`${baseUrl}/api/failures/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supabaseUrl,
          supabaseAnonKey,
          limit: 100,
        }),
      })

      const result = await response.json()

      if (!result.success) {
        setError(result.error || 'Failed to fetch failures')
        return
      }

      setFailures(result.failures || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch failures')
    } finally {
      setLoading(false)
    }
  }, [supabaseUrl, supabaseAnonKey])

  const fetchFailureDetails = useCallback(async (failureId: string) => {
    if (!supabaseUrl || !supabaseAnonKey) {
      setError('Supabase credentials not configured')
      return
    }

    setDetailsLoading(true)
    setError(null)

    try {
      const baseUrl = window.location.origin
      const response = await fetch(`${baseUrl}/api/failures/get`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          failureId,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const result = await response.json()

      if (!result.success) {
        setError(result.error || 'Failed to fetch failure details')
        return
      }

      setSelectedFailure(result.failure)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch failure details')
    } finally {
      setDetailsLoading(false)
    }
  }, [supabaseUrl, supabaseAnonKey])

  useEffect(() => {
    fetchFailures()
  }, [fetchFailures])

  useEffect(() => {
    if (selectedFailureId) {
      fetchFailureDetails(selectedFailureId)
    } else {
      setSelectedFailure(null)
    }
  }, [selectedFailureId, fetchFailureDetails])

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString()
    } catch {
      return dateString
    }
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <section>
        <h3>Failures</h3>
        <div className="build-info">
          <p>Supabase credentials not configured. Connect a project to view failures.</p>
        </div>
      </section>
    )
  }

  return (
    <section>
      <h3>Failures</h3>
      <div className="build-info">
        {loading && <p>Loading failures...</p>}
        {error && <p className="debug-error" role="alert">Error: {error}</p>}
        
        {!loading && !error && failures.length === 0 && (
          <div className="failures-empty-state">
            <p>No failures have been recorded yet.</p>
            <p>Failures will appear here when drift attempts or agent outcomes fail.</p>
          </div>
        )}

        {!loading && !error && failures.length > 0 && (
          <>
            <p className="failures-summary">Total failures: {failures.length}</p>
            <div className="failures-table-container">
              <table className="failures-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Recurrence</th>
                    <th>First Seen</th>
                    <th>Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {failures.map((failure) => (
                    <tr
                      key={failure.id}
                      className={selectedFailureId === failure.id ? 'selected' : ''}
                      onClick={() => setSelectedFailureId(selectedFailureId === failure.id ? null : failure.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>{failure.failure_type}</td>
                      <td>{failure.recurrence_count}</td>
                      <td>{formatDate(failure.first_seen_at)}</td>
                      <td>{formatDate(failure.last_seen_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedFailureId && (
              <div className="failures-details">
                {detailsLoading ? (
                  <p>Loading details...</p>
                ) : selectedFailure ? (
                  <div className="failure-details-content">
                    <h4>Failure Details</h4>
                    <div className="failure-detail-row">
                      <strong>Type:</strong> {selectedFailure.failure_type}
                    </div>
                    <div className="failure-detail-row">
                      <strong>Root Cause:</strong>
                      <div className="failure-detail-value">
                        {selectedFailure.root_cause || <em>No root cause recorded</em>}
                      </div>
                    </div>
                    <div className="failure-detail-row">
                      <strong>Prevention Candidate:</strong>
                      <div className="failure-detail-value">
                        {selectedFailure.prevention_candidate || <em>No prevention candidate recorded</em>}
                      </div>
                    </div>
                    <div className="failure-detail-row">
                      <strong>Recurrence Count:</strong> {selectedFailure.recurrence_count}
                    </div>
                    <div className="failure-detail-row">
                      <strong>First Seen:</strong> {formatDate(selectedFailure.first_seen_at)}
                    </div>
                    <div className="failure-detail-row">
                      <strong>Last Seen:</strong> {formatDate(selectedFailure.last_seen_at)}
                    </div>
                  </div>
                ) : (
                  <p>Failed to load failure details</p>
                )}
              </div>
            )}
          </>
        )}

        <button
          type="button"
          onClick={fetchFailures}
          disabled={loading}
          style={{ marginTop: '1rem' }}
        >
          Refresh
        </button>
      </div>
    </section>
  )
}
