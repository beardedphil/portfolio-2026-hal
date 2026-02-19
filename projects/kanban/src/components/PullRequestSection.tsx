import React, { useState } from 'react'

export type PullRequestInfo = {
  prUrl: string
  prNumber: number
  branchName: string
  baseBranch: string
  baseCommitSha: string
  headCommitSha: string
}

/** Pull Request Section: displays PR info and allows creating draft PRs */
export function PullRequestSection({
  ticketId,
  ticketPk,
  prUrl,
  supabaseUrl,
  supabaseAnonKey,
  onPrCreated,
}: {
  ticketId: string
  ticketPk?: string
  prUrl: string | null
  supabaseUrl: string
  supabaseAnonKey: string
  onPrCreated?: (info: PullRequestInfo) => void
}) {
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prInfo, setPrInfo] = useState<PullRequestInfo | null>(null)
  const [isLoadingPrInfo, setIsLoadingPrInfo] = useState(false)

  // If we have prUrl but no prInfo, fetch it
  React.useEffect(() => {
    if (prUrl && !prInfo && !isLoadingPrInfo) {
      setIsLoadingPrInfo(true)
      // Extract PR number from URL
      const match = prUrl.match(/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/i)
      if (match) {
        const prNumber = parseInt(match[1], 10)
        // We'll need to fetch full PR info from API, but for now just show URL
        setIsLoadingPrInfo(false)
      } else {
        setIsLoadingPrInfo(false)
      }
    }
  }, [prUrl, prInfo, isLoadingPrInfo])

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
          ticketId,
          ticketPk,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const result = await response.json()

      if (!result.success) {
        setError(result.error || 'Failed to create PR')
        setIsCreating(false)
        return
      }

      const info: PullRequestInfo = {
        prUrl: result.prUrl,
        prNumber: result.prNumber,
        branchName: result.branchName,
        baseBranch: result.baseBranch,
        baseCommitSha: result.baseCommitSha,
        headCommitSha: result.headCommitSha,
      }

      setPrInfo(info)
      if (onPrCreated) {
        onPrCreated(info)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create PR')
    } finally {
      setIsCreating(false)
    }
  }

  const displayPrUrl = prInfo?.prUrl || prUrl
  const displayPrNumber = prInfo?.prNumber || (displayPrUrl ? (() => {
    const match = displayPrUrl.match(/\/pull\/(\d+)/i)
    return match ? parseInt(match[1], 10) : null
  })() : null)

  return (
    <div className="pull-request-section">
      <h3 className="pull-request-section-title">Pull Request</h3>

      {error && (
        <div className="pull-request-error" role="alert">
          <p>{error}</p>
        </div>
      )}

      {!displayPrUrl ? (
        <div className="pull-request-empty">
          <p>No pull request created yet.</p>
          <button
            type="button"
            className="pull-request-create-button"
            onClick={handleCreatePr}
            disabled={isCreating}
          >
            {isCreating ? 'Creating draft PR...' : 'Create draft PR'}
          </button>
        </div>
      ) : (
        <div className="pull-request-info">
          <div className="pull-request-field">
            <strong>PR:</strong>{' '}
            <a
              href={displayPrUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="pull-request-link"
            >
              #{displayPrNumber} (opens in new tab)
            </a>
            <span className="pull-request-draft-badge">Draft</span>
          </div>

          {prInfo && (
            <>
              <div className="pull-request-field">
                <strong>Branch:</strong>{' '}
                <code className="pull-request-branch-name">{prInfo.branchName}</code>
              </div>

              <div className="pull-request-field">
                <strong>Base branch:</strong>{' '}
                <code className="pull-request-base-branch">{prInfo.baseBranch}</code>
              </div>

              <div className="pull-request-field">
                <strong>Base commit SHA:</strong>{' '}
                <code className="pull-request-commit-sha">{prInfo.baseCommitSha.substring(0, 7)}</code>
              </div>

              <div className="pull-request-field">
                <strong>Head commit SHA:</strong>{' '}
                <code className="pull-request-commit-sha">{prInfo.headCommitSha.substring(0, 7)}</code>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
