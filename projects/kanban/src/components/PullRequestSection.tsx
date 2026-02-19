import React, { useState, useCallback } from 'react'

export interface PullRequestSectionProps {
  ticketId: string
  ticketPk: string
  prUrl: string | null | undefined
  prNumber: number | null | undefined
  branchName: string | null | undefined
  baseCommitSha: string | null | undefined
  headCommitSha: string | null | undefined
  repoFullName: string | null | undefined
  defaultBranch?: string
  supabaseUrl: string
  supabaseAnonKey: string
  onPrCreated?: () => void
}

/** Pull Request section for ticket detail modal (HAL-0771) */
export function PullRequestSection({
  ticketId,
  ticketPk,
  prUrl,
  prNumber,
  branchName,
  baseCommitSha,
  headCommitSha,
  repoFullName,
  defaultBranch = 'main',
  supabaseUrl,
  supabaseAnonKey,
  onPrCreated,
}: PullRequestSectionProps) {
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createSuccess, setCreateSuccess] = useState<string | null>(null)

  const handleCreatePr = useCallback(async () => {
    if (!repoFullName) {
      setCreateError('Repository not specified. Cannot create PR.')
      return
    }

    setIsCreating(true)
    setCreateError(null)
    setCreateSuccess(null)

    try {
      const response = await fetch('/api/tickets/create-pr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ticketPk,
          ticketId,
          repoFullName,
          defaultBranch,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const result = await response.json()

      if (!result.success) {
        setCreateError(result.error || 'Failed to create PR')
        return
      }

      setCreateSuccess('PR created successfully!')
      if (onPrCreated) {
        onPrCreated()
      }

      // Refresh the page after a short delay to show the new PR info
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create PR')
    } finally {
      setIsCreating(false)
    }
  }, [ticketPk, ticketId, repoFullName, defaultBranch, supabaseUrl, supabaseAnonKey, onPrCreated])

  const hasPr = prUrl && prUrl.trim().length > 0

  return (
    <div className="ticket-detail-section" style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(0,0,0,0.1)' }}>
      <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', fontWeight: '600' }}>Pull Request</h3>

      {createError && (
        <div className="ticket-detail-error" role="alert" style={{ marginBottom: '1rem' }}>
          <p>{createError}</p>
        </div>
      )}

      {createSuccess && (
        <div className="success-message" role="status" style={{ marginBottom: '1rem', color: '#2e7d32' }}>
          <p>{createSuccess}</p>
        </div>
      )}

      {hasPr ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <strong>PR:</strong>{' '}
            <a
              href={prUrl!}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#2563eb', textDecoration: 'underline' }}
            >
              #{prNumber || 'View PR'}
            </a>
            {' '}
            <span style={{ fontSize: '0.9rem', color: 'rgba(0,0,0,0.6)' }}>(Draft)</span>
          </div>

          {branchName && (
            <div>
              <strong>Branch:</strong>{' '}
              <code style={{ padding: '2px 6px', background: 'rgba(0,0,0,0.05)', borderRadius: '3px', fontSize: '0.9rem' }}>
                {branchName}
              </code>
            </div>
          )}

          <div style={{ fontSize: '0.9rem', color: 'rgba(0,0,0,0.7)' }}>
            <div>
              <strong>Base:</strong> {defaultBranch}
              {baseCommitSha && (
                <span style={{ marginLeft: '0.5rem', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                  ({baseCommitSha.substring(0, 7)})
                </span>
              )}
            </div>
            {headCommitSha && (
              <div style={{ marginTop: '0.25rem' }}>
                <strong>Head:</strong>{' '}
                <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                  {headCommitSha.substring(0, 7)}
                </span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div>
          <p style={{ marginBottom: '1rem', color: 'rgba(0,0,0,0.7)' }}>
            No pull request associated with this ticket.
          </p>
          <button
            type="button"
            onClick={handleCreatePr}
            disabled={isCreating || !repoFullName}
            style={{
              padding: '10px 20px',
              borderRadius: '6px',
              border: 'none',
              background: isCreating ? '#94a3b8' : '#2563eb',
              color: 'white',
              cursor: isCreating ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            {isCreating ? 'Creating PR...' : 'Create draft PR'}
          </button>
        </div>
      )}
    </div>
  )
}
