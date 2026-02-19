import { extractFeatureBranch, checkMergedToMain } from '../lib/ticketBody'

/** QA Info Section: displays PR and branch info when ticket is in QA column (0113, 0148, 0771) */
export function QAInfoSection({
  bodyMd,
  prUrl,
  prNumber,
  branchName,
  baseCommitSha,
  headCommitSha,
  repoFullName,
}: {
  bodyMd: string | null
  prUrl?: string | null
  prNumber?: number | null
  branchName?: string | null
  baseCommitSha?: string | null
  headCommitSha?: string | null
  repoFullName?: string | null
}) {
  // Fallback to parsing ticket body if PR data not available (backward compatibility)
  const featureBranch = branchName || extractFeatureBranch(bodyMd)
  const mergeStatus = checkMergedToMain(bodyMd)
  const hasPr = prUrl && prUrl.trim().length > 0
  
  return (
    <div className="qa-info-section">
      <h3 className="qa-info-section-title">QA Information</h3>
      
      {hasPr ? (
        <>
          <div className="qa-info-field">
            <strong>Pull Request:</strong>{' '}
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
            <div className="qa-info-field">
              <strong>Feature branch:</strong>{' '}
              <code className="qa-branch-name">{branchName}</code>
            </div>
          )}
          
          {baseCommitSha && (
            <div className="qa-info-field" style={{ fontSize: '0.9rem', color: 'rgba(0,0,0,0.7)' }}>
              <strong>Base commit:</strong>{' '}
              <span style={{ fontFamily: 'monospace' }}>{baseCommitSha.substring(0, 7)}</span>
            </div>
          )}
          
          {headCommitSha && (
            <div className="qa-info-field" style={{ fontSize: '0.9rem', color: 'rgba(0,0,0,0.7)' }}>
              <strong>Head commit:</strong>{' '}
              <span style={{ fontFamily: 'monospace' }}>{headCommitSha.substring(0, 7)}</span>
            </div>
          )}
          
          <div className="qa-info-field">
            <strong>CI/Status:</strong>{' '}
            <span style={{ fontSize: '0.9rem', color: 'rgba(0,0,0,0.6)' }}>
              Check PR status on GitHub
            </span>
          </div>
        </>
      ) : (
        <>
          <div className="qa-info-field">
            <strong>Feature branch:</strong>{' '}
            {featureBranch ? (
              <code className="qa-branch-name">{featureBranch}</code>
            ) : (
              <span className="qa-missing">Not specified</span>
            )}
          </div>
          
          <div className="qa-info-field">
            <strong>Merged to main:</strong>{' '}
            {mergeStatus.merged ? (
              <span className="qa-merged-yes">
                ✅ Yes
                {mergeStatus.timestamp && (
                  <span className="qa-merged-timestamp"> ({mergeStatus.timestamp})</span>
                )}
              </span>
            ) : (
              <span className="qa-merged-no">❌ No</span>
            )}
          </div>
          
          <div className="qa-workflow-warning" role="alert">
            <strong>Action required:</strong> No PR associated with this ticket. Create a draft PR to enable drift/CI gating.
          </div>
        </>
      )}
    </div>
  )
}
