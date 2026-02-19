import React, { useState, useCallback } from 'react'

export function PullRequestSection({
  ticketPk,
  repoFullName,
  supabaseUrl,
  supabaseKey,
  onRefresh,
}: {
  ticketPk: string
  repoFullName: string | null
  supabaseUrl: string
  supabaseKey: string
  onRefresh?: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prData, setPrData] = useState<{
    prUrl: string
    prNumber: number
    branchName: string
    baseBranch: string
    baseSha: string
    headSha: string
  } | null>(null)
  const [fetching, setFetching] = useState(true)

  // Fetch existing PR info by calling create-pr endpoint (which returns existing PR if it exists)
  const fetchPrInfo = useCallback(async () => {
    if (!ticketPk || !repoFullName) {
      setFetching(false)
      return
    }

    setFetching(true)
    try {
      // Call create-pr endpoint - it will return existing PR info if PR already exists
      const res = await fetch('/api/tickets/create-pr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ticketPk,
          supabaseUrl,
          supabaseAnonKey: supabaseKey,
        }),
      })
      const data = await res.json()
      if (data.success && data.prUrl) {
        setPrData({
          prUrl: data.prUrl,
          prNumber: data.prNumber || 0,
          branchName: data.branchName || '',
          baseBranch: data.baseBranch || 'main',
          baseSha: data.baseSha || '',
          headSha: data.headSha || '',
        })
      }
    } catch (err) {
      console.error('Failed to fetch PR info:', err)
      // Don't set error - this is just a check, failure is OK
    } finally {
      setFetching(false)
    }
  }, [ticketPk, repoFullName, supabaseUrl, supabaseKey])

  // Check for existing PR on mount
  React.useEffect(() => {
    fetchPrInfo()
  }, [fetchPrInfo])

  const handleCreatePr = useCallback(async () => {
    if (!ticketPk || !repoFullName) {
      setError('Repository information missing')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/tickets/create-pr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ticketPk,
          supabaseUrl,
          supabaseAnonKey: supabaseKey,
        }),
      })

      const data = await res.json()

      if (!data.success) {
        setError(data.error || 'Failed to create PR')
        return
      }

      // Update state with PR info
      setPrData({
        prUrl: data.prUrl,
        prNumber: data.prNumber,
        branchName: data.branchName,
        baseBranch: data.baseBranch,
        baseSha: data.baseSha,
        headSha: data.headSha,
      })

      if (onRefresh) {
        onRefresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create PR')
    } finally {
      setLoading(false)
    }
  }, [ticketPk, repoFullName, supabaseUrl, supabaseKey, onRefresh])

  if (!repoFullName) {
    return (
      <div className="ticket-detail-section">
        <h3 className="ticket-detail-section-title">Pull Request</h3>
        <p className="ticket-detail-section-empty">No repository associated with this ticket.</p>
      </div>
    )
  }

  if (fetching) {
    return (
      <div className="ticket-detail-section">
        <h3 className="ticket-detail-section-title">Pull Request</h3>
        <p className="ticket-detail-section-loading">Loading...</p>
      </div>
    )
  }

  return (
    <div className="ticket-detail-section">
      <h3 className="ticket-detail-section-title">Pull Request</h3>
      {error && (
        <div className="ticket-detail-error" role="alert" style={{ marginBottom: '1rem' }}>
          <p>{error}</p>
        </div>
      )}
      {prData ? (
        <div className="pull-request-info">
          <div style={{ marginBottom: '0.5rem' }}>
            <strong>Branch:</strong>{' '}
            <code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: '3px' }}>
              {prData.branchName}
            </code>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <strong>Base branch:</strong> <code>{prData.baseBranch}</code>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <a
              href={prData.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#1976d2', textDecoration: 'underline' }}
            >
              View PR #{prData.prNumber} on GitHub
            </a>
            <span style={{ marginLeft: '0.5rem', color: '#666', fontSize: '0.9em' }}>
              (Draft)
            </span>
          </div>
          <div style={{ fontSize: '0.85em', color: '#666' }}>
            <div>
              <strong>Base SHA:</strong> <code style={{ fontSize: '0.9em' }}>{prData.baseSha.substring(0, 7)}</code>
            </div>
            <div>
              <strong>Head SHA:</strong> <code style={{ fontSize: '0.9em' }}>{prData.headSha.substring(0, 7)}</code>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={handleCreatePr}
            disabled={loading}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#1976d2',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Creating...' : 'Create draft PR'}
          </button>
        </div>
      )}
    </div>
  )
}
