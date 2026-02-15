import React from 'react'
import { extractFeatureBranch, checkMergedToMain } from '../lib/ticketBody'

/** QA Info Section: displays feature branch when ticket is in QA column (0113, 0148) */
export function QAInfoSection({
  bodyMd,
}: {
  bodyMd: string | null
}) {
  const featureBranch = extractFeatureBranch(bodyMd)
  const mergeStatus = checkMergedToMain(bodyMd)
  
  return (
    <div className="qa-info-section">
      <h3 className="qa-info-section-title">QA Information</h3>
      
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
      
      {!mergeStatus.merged && (
        <div className="qa-workflow-warning" role="alert">
          <strong>Warning:</strong> This ticket must be merged to main before it can be moved to Human in the Loop.
        </div>
      )}
    </div>
  )
}
