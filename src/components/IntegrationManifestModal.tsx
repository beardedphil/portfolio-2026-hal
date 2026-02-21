import { useState } from 'react'
import type { ConnectedGithubRepo } from '../types/app'

interface IntegrationManifestModalProps {
  isOpen: boolean
  connectedRepo: ConnectedGithubRepo | null
  onClose: () => void
}

interface ManifestResponse {
  success: boolean
  manifest?: {
    schema_version: string
    repo_full_name: string
    default_branch: string
    goal: string
    stack: string[]
    constraints: string[]
    conventions: string[]
    generated_at: string
    env_identifiers: Record<string, string>
  }
  versionId?: string
  versionNumber?: number
  isNewVersion?: boolean
  previousVersionId?: string | null
  error?: string
}

export function IntegrationManifestModal({
  isOpen,
  connectedRepo,
  onClose,
}: IntegrationManifestModalProps) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ManifestResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleRegenerate = async () => {
    if (!connectedRepo) {
      setError('Repository required')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const baseUrl = window.location.origin
      const response = await fetch(`${baseUrl}/api/manifests/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Include session cookie for GitHub auth
        body: JSON.stringify({
          repoFullName: connectedRepo.fullName,
          defaultBranch: connectedRepo.defaultBranch,
          schemaVersion: 'v0',
          envIdentifiers: {},
        }),
      })

      const data = (await response.json()) as ManifestResponse
      if (data.success) {
        setResult(data)
      } else {
        setError(data.error || 'Failed to generate manifest')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate manifest')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="conversation-modal-overlay" onClick={onClose}>
      <div className="conversation-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px' }}>
        <div className="conversation-modal-header">
          <h3>Integration Manifest v0</h3>
          <button
            type="button"
            className="conversation-modal-close btn-destructive"
            onClick={onClose}
            aria-label="Close manifest modal"
          >
            ×
          </button>
        </div>
        <div className="conversation-modal-content" style={{ padding: '20px' }}>
          {connectedRepo ? (
            <>
              <div style={{ marginBottom: '20px' }}>
                <p>
                  <strong>Repository:</strong> {connectedRepo.fullName}
                </p>
                <p>
                  <strong>Default Branch:</strong> {connectedRepo.defaultBranch}
                </p>
              </div>

              <button
                type="button"
                className="btn-standard"
                onClick={handleRegenerate}
                disabled={loading}
                style={{ marginBottom: '20px' }}
              >
                {loading ? 'Generating...' : 'Regenerate Integration Manifest'}
              </button>

              {error && (
                <div style={{ padding: '12px', background: 'rgba(255, 0, 0, 0.1)', borderRadius: '4px', marginBottom: '20px' }}>
                  <strong>Error:</strong> {error}
                </div>
              )}

              {result && result.success && result.manifest && (
                <div>
                  <div style={{ marginBottom: '20px', padding: '12px', background: 'rgba(0, 255, 0, 0.1)', borderRadius: '4px' }}>
                    <p>
                      <strong>Status:</strong>{' '}
                      {result.isNewVersion ? (
                        <span style={{ color: 'green' }}>New version created</span>
                      ) : (
                        <span style={{ color: 'blue' }}>Reused existing version</span>
                      )}
                    </p>
                    <p>
                      <strong>Version ID:</strong> {result.versionId}
                    </p>
                    <p>
                      <strong>Version Number:</strong> {result.versionNumber}
                    </p>
                    {result.previousVersionId && (
                      <p>
                        <strong>Previous Version ID:</strong> {result.previousVersionId}
                      </p>
                    )}
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <h4>Manifest Content</h4>
                    <div style={{ background: '#f5f5f5', padding: '12px', borderRadius: '4px', overflow: 'auto', maxHeight: '400px' }}>
                      <pre style={{ margin: 0, fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {JSON.stringify(result.manifest, null, 2)}
                      </pre>
                    </div>
                  </div>

                  <div>
                    <h4>Summary</h4>
                    <ul style={{ margin: 0, paddingLeft: '20px' }}>
                      <li>
                        <strong>Goal:</strong> {result.manifest.goal}
                      </li>
                      <li>
                        <strong>Stack:</strong> {result.manifest.stack.length} dependencies
                      </li>
                      <li>
                        <strong>Constraints:</strong> {result.manifest.constraints.length} items
                      </li>
                      <li>
                        <strong>Conventions:</strong> {result.manifest.conventions.length} items
                      </li>
                      <li>
                        <strong>Generated At:</strong> {new Date(result.manifest.generated_at).toLocaleString()}
                      </li>
                    </ul>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p>No repository connected</p>
          )}
        </div>
      </div>
    </div>
  )
}
