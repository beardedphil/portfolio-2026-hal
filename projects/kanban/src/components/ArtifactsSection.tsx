import React from 'react'
import type { SupabaseAgentArtifactRow } from './types'
import { getAgentTypeDisplayName } from './utils'

/** Artifacts section component (0082) with error state detection (0137) */
export function ArtifactsSection({
  artifacts,
  loading,
  onOpenArtifact,
  statusMessage = null,
  onRefresh: _onRefresh = undefined,
  refreshing = false,
  columnId = null,
}: {
  artifacts: SupabaseAgentArtifactRow[]
  loading: boolean
  onOpenArtifact: (artifact: SupabaseAgentArtifactRow) => void
  statusMessage?: string | null
  onRefresh?: () => void
  refreshing?: boolean
  columnId?: string | null
}) {
  const isLoading = loading || refreshing

  // Detect missing expected artifacts for implementation tickets in QA or later columns (0196)
  const isImplementationTicket = artifacts.some((a) => a.agent_type === 'implementation')
  const isInQaOrLater = columnId === 'col-qa' || columnId === 'col-human-in-the-loop' || columnId === 'col-process-review'
  
  // Check for all 8 required implementation artifacts
  const requiredArtifactTypes = [
    { key: 'plan', title: 'Plan' },
    { key: 'worklog', title: 'Worklog' },
    { key: 'changed-files', title: 'Changed Files' },
    { key: 'decisions', title: 'Decisions' },
    { key: 'verification', title: 'Verification' },
    { key: 'pm-review', title: 'PM Review' },
    { key: 'git-diff', title: 'Git diff' },
    { key: 'instructions-used', title: 'Instructions Used' },
  ]
  
  const hasArtifact = (type: string) => {
    const typeLower = type.toLowerCase()
    return artifacts.some((a) => {
      const titleLower = a.title?.toLowerCase() || ''
      const isMatch = 
        (typeLower === 'plan' && titleLower.includes('plan for ticket')) ||
        (typeLower === 'worklog' && titleLower.includes('worklog for ticket')) ||
        (typeLower === 'changed-files' && titleLower.includes('changed files for ticket')) ||
        (typeLower === 'decisions' && titleLower.includes('decisions for ticket')) ||
        (typeLower === 'verification' && titleLower.includes('verification for ticket')) ||
        (typeLower === 'pm-review' && titleLower.includes('pm review for ticket')) ||
        (typeLower === 'git-diff' && (titleLower.includes('git diff for ticket') || titleLower.includes('git-diff for ticket'))) ||
        (typeLower === 'instructions-used' && titleLower.includes('instructions used for ticket'))
      
      return isMatch && 
        a.agent_type === 'implementation' &&
        a.body_md && 
        a.body_md.trim().length > 50 && // Substantive content check
        !a.body_md.includes('(none)') &&
        !a.body_md.includes('(No files changed')
    })
  }
  
  const missingArtifacts = isImplementationTicket && isInQaOrLater
    ? requiredArtifactTypes.filter(({ key }) => !hasArtifact(key))
    : []
  
  // Legacy checks for backward compatibility
  const hasChangedFiles = hasArtifact('changed-files')
  const hasVerification = hasArtifact('verification')
  const missingChangedFiles = isImplementationTicket && isInQaOrLater && !hasChangedFiles
  const missingVerification = isImplementationTicket && isInQaOrLater && !hasVerification

  // Detect contradictory information (0137)
  const qaReport = artifacts.find((a) => 
    a.agent_type === 'qa' && 
    a.title?.toLowerCase().includes('qa report')
  )
  const hasContradiction = qaReport && qaReport.body_md && (
    (missingChangedFiles && qaReport.body_md.toLowerCase().includes('changed files')) ||
    (missingVerification && qaReport.body_md.toLowerCase().includes('verification'))
  )

  if (isLoading) {
    return (
      <div className="artifacts-section">
        <h3 className="artifacts-section-title">Artifacts</h3>
        <p className="artifacts-loading">Loading artifacts…</p>
        {statusMessage && <p className="artifacts-status" role="status">{statusMessage}</p>}
      </div>
    )
  }

  if (artifacts.length === 0) {
    return (
      <div className="artifacts-section">
        <h3 className="artifacts-section-title">Artifacts</h3>
        <p className="artifacts-empty">No artifacts available for this ticket.</p>
        {statusMessage && <p className="artifacts-status" role="status">{statusMessage}</p>}
      </div>
    )
  }

  // Sort all artifacts by created_at ascending (oldest first) with secondary sort by artifact_id for deterministic ordering (0147)
  const sortedArtifacts = [...artifacts].sort((a, b) => {
    const timeA = new Date(a.created_at).getTime()
    const timeB = new Date(b.created_at).getTime()
    if (timeA !== timeB) {
      return timeA - timeB
    }
    // Secondary sort by artifact_id for deterministic ordering when timestamps are equal
    return a.artifact_id.localeCompare(b.artifact_id)
  })

  return (
    <div className="artifacts-section">
      <h3 className="artifacts-section-title">Artifacts</h3>
      {statusMessage && <p className="artifacts-status" role="status">{statusMessage}</p>}
      
      {/* Warning banner for contradictory information (0137) */}
      {hasContradiction && (
        <div className="artifacts-warning-banner" role="alert">
          <strong>Warning:</strong> QA report references artifacts that are missing or unavailable. This may indicate a data synchronization issue.
        </div>
      )}

      {/* Error states for missing expected artifacts (0196) */}
      {missingArtifacts.length > 0 && (
        <div className="artifacts-error-state" role="alert">
          <strong>Missing required implementation artifacts:</strong> The following {missingArtifacts.length} required artifact{missingArtifacts.length > 1 ? 's are' : ' is'} missing or empty:
          <ul style={{ marginTop: '0.5em', marginBottom: '0.5em', paddingLeft: '1.5em' }}>
            {missingArtifacts.map(({ title }) => (
              <li key={title}>{title}</li>
            ))}
          </ul>
          This may indicate that artifact insertion failed (API error, validation error, or network error). Check the implementation agent logs for error messages.
        </div>
      )}
      {/* Legacy error states for backward compatibility (0137) */}
      {missingChangedFiles && !missingArtifacts.some(a => a.key === 'changed-files') && (
        <div className="artifacts-error-state" role="alert">
          <strong>Changed Files artifact unavailable:</strong> Unable to determine changed files. This may be due to missing PR/branch information or GitHub API failure.
        </div>
      )}
      {missingVerification && !missingArtifacts.some(a => a.key === 'verification') && (
        <div className="artifacts-error-state" role="alert">
          <strong>Verification artifact unavailable:</strong> Unable to generate verification content. This may be due to missing PR/branch information or GitHub API failure.
        </div>
      )}

      <ul className="artifacts-list">
        {sortedArtifacts.map((artifact) => {
          // Use artifact title directly, or fall back to agent type display name
          const displayName = artifact.title || getAgentTypeDisplayName(artifact.agent_type)
          return (
            <li key={artifact.artifact_id} className="artifacts-item">
              <button
                type="button"
                className="artifacts-item-button"
                onClick={() => onOpenArtifact(artifact)}
                aria-label={`Open ${displayName}`}
              >
                <span className="artifacts-item-title">{displayName}</span>
                <span className="artifacts-item-meta">
                  {new Date(artifact.created_at).toLocaleString()}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
