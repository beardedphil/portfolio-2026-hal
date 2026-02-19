import { useState } from 'react'

export function PullRequestSection({
  ticketPk,
  ticketId,
  prUrl,
  prNumber,
  branchName,
  baseCommitSha,
  headCommitSha,
  baseBranch,
  repoFullName,
  supabaseUrl,
  supabaseAnonKey,
  onPrCreated,
}: {
  ticketPk: string
  ticketId: string
  prUrl?: string | null
  prNumber?: number | null
  branchName?: string | null
  baseCommitSha?: string | null
  headCommitSha?: string | null
  baseBranch?: string
  repoFullName?: string | null
  supabaseUrl?: string
  supabaseAnonKey?: string
  onPrCreated?: () => void
}) {
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreatePr = async () => {
    if (isCreating) return
    
    setIsCreating(true)
    setError(null)

    try {
      const baseUrl = window.location.origin
      const response = await fetch(`${baseUrl}/api/tickets/create-pr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketPk,
          ticketId,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const result = await response.json()

      if (!result.success) {
        setError(result.error || 'Failed to create PR')
        return
      }

      // Update local state with PR data
      // The component will re-render with the new PR data after onPrCreated refreshes the ticket
      
      // Refresh ticket data
      if (onPrCreated) {
        await onPrCreated()
      } else {
        // Fallback: reload page
        window.location.reload()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create PR')
    } finally {
      setIsCreating(false)
    }
  }

  if (prUrl && prNumber) {
    // PR exists - show PR info
    const prUrlMatch = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i)
    const repoDisplay = prUrlMatch ? `${prUrlMatch[1]}/${prUrlMatch[2]}` : repoFullName || 'repository'
    
    return (
      <div className="pull-request-section">
        <h3 className="pull-request-section-title">Pull Request</h3>
        <div className="pull-request-info">
          <div className="pull-request-link-row">
            <span className="pull-request-label">PR:</span>
            <a
              href={prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="pull-request-link"
            >
              {repoDisplay} #{prNumber}
            </a>
            <span className="pull-request-status draft">Draft</span>
          </div>
          {branchName && (
            <div className="pull-request-branch-row">
              <span className="pull-request-label">Branch:</span>
              <code className="pull-request-branch-name">{branchName}</code>
            </div>
          )}
          {baseBranch && (
            <div className="pull-request-base-row">
              <span className="pull-request-label">Base branch:</span>
              <code className="pull-request-base-branch">{baseBranch}</code>
            </div>
          )}
          {baseCommitSha && (
            <div className="pull-request-commit-row">
              <span className="pull-request-label">Base commit:</span>
              <code className="pull-request-commit-sha">{baseCommitSha.slice(0, 7)}</code>
            </div>
          )}
          {headCommitSha && (
            <div className="pull-request-commit-row">
              <span className="pull-request-label">Head commit:</span>
              <code className="pull-request-commit-sha">{headCommitSha.slice(0, 7)}</code>
            </div>
          )}
        </div>
      </div>
    )
  }

  // No PR - show create button
  return (
    <div className="pull-request-section">
      <h3 className="pull-request-section-title">Pull Request</h3>
      {error && (
        <div className="pull-request-error" role="alert">
          <p>{error}</p>
        </div>
      )}
      <div className="pull-request-create">
        <button
          type="button"
          onClick={handleCreatePr}
          disabled={isCreating}
          className="pull-request-create-button"
        >
          {isCreating ? 'Creating...' : 'Create draft PR'}
        </button>
        {isCreating && (
          <p className="pull-request-creating-note">
            Creating branch and draft PR...
          </p>
        )}
      </div>
    </div>
  )
}
