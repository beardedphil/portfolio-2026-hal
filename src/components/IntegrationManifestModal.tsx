import { useState, useEffect } from 'react'

interface IntegrationManifestModalProps {
  isOpen: boolean
  onClose: () => void
  repoFullName: string | null
  defaultBranch: string
}

interface ManifestResponse {
  success: boolean
  manifest?: {
    schema_version: string
    repo_full_name: string
    default_branch: string
    project_id: string
    env_identifiers: Record<string, string>
    project_manifest: {
      goal: string
      stack: Record<string, string[]>
      constraints: Record<string, string>
      conventions: Record<string, string>
    }
    generated_at: string
  }
  manifest_id?: string
  version?: number
  content_checksum?: string
  previous_version_id?: string | null
  reused?: boolean
  message?: string
  error?: string
}

export function IntegrationManifestModal({
  isOpen,
  onClose,
  repoFullName,
  defaultBranch,
}: IntegrationManifestModalProps) {
  const apiBaseUrl = import.meta.env.VITE_HAL_API_BASE_URL || window.location.origin
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ManifestResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleRegenerate = async () => {
    if (!repoFullName) {
      setError('No repository connected')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch(`${apiBaseUrl}/api/integration-manifests/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          repoFullName,
          defaultBranch,
          schemaVersion: 'v0',
        }),
      })

      const data = (await response.json()) as ManifestResponse

      if (!response.ok || !data.success) {
        setError(data.error || 'Failed to generate manifest')
        return
      }

      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setResult(null)
      setError(null)
      setLoading(false)
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Integration Manifest</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          {!result && !error && (
            <div>
              <p>Generate or regenerate the Integration Manifest for this repository.</p>
              <p>
                <strong>Repository:</strong> {repoFullName || 'Not connected'}
              </p>
              <p>
                <strong>Branch:</strong> {defaultBranch}
              </p>
              <button
                type="button"
                className="btn-standard"
                onClick={handleRegenerate}
                disabled={loading || !repoFullName}
              >
                {loading ? 'Generating...' : 'Regenerate Integration Manifest'}
              </button>
            </div>
          )}

          {error && (
            <div className="error-message">
              <p>
                <strong>Error:</strong> {error}
              </p>
              <button type="button" className="btn-standard" onClick={() => setError(null)}>
                Try Again
              </button>
            </div>
          )}

          {result && result.manifest && (
            <div className="manifest-result">
              <div className="manifest-meta">
                <p>
                  <strong>Status:</strong>{' '}
                  {result.reused ? (
                    <span className="reused-badge">Reused existing version</span>
                  ) : (
                    <span className="new-badge">New version created</span>
                  )}
                </p>
                <p>
                  <strong>Version:</strong> {result.version}
                </p>
                <p>
                  <strong>Manifest ID:</strong> <code>{result.manifest_id}</code>
                </p>
                <p>
                  <strong>Checksum:</strong> <code>{result.content_checksum?.substring(0, 16)}...</code>
                </p>
                {result.message && (
                  <p className="info-message">{result.message}</p>
                )}
              </div>

              <div className="manifest-content">
                <h3>Manifest Contents</h3>
                <div className="manifest-section">
                  <h4>Repository Information</h4>
                  <p><strong>Repository:</strong> {result.manifest.repo_full_name}</p>
                  <p><strong>Default Branch:</strong> {result.manifest.default_branch}</p>
                  <p><strong>Project ID:</strong> {result.manifest.project_id}</p>
                </div>
                <div className="manifest-section">
                  <h4>Goal</h4>
                  <p>{result.manifest.project_manifest?.goal}</p>
                </div>

                {Object.keys(result.manifest.project_manifest?.stack || {}).length > 0 && (
                  <div className="manifest-section">
                    <h4>Stack</h4>
                    <pre>{JSON.stringify(result.manifest.project_manifest.stack, null, 2)}</pre>
                  </div>
                )}

                {Object.keys(result.manifest.project_manifest?.constraints || {}).length > 0 && (
                  <div className="manifest-section">
                    <h4>Constraints</h4>
                    <pre>{JSON.stringify(result.manifest.project_manifest.constraints, null, 2)}</pre>
                  </div>
                )}

                {Object.keys(result.manifest.project_manifest?.conventions || {}).length > 0 && (
                  <div className="manifest-section">
                    <h4>Conventions</h4>
                    <pre>{JSON.stringify(result.manifest.project_manifest.conventions, null, 2)}</pre>
                  </div>
                )}

                <div className="manifest-section">
                  <h4>Full Manifest (JSON)</h4>
                  <pre className="manifest-json">{JSON.stringify(result.manifest, null, 2)}</pre>
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-standard" onClick={handleRegenerate} disabled={loading}>
                  Regenerate Again
                </button>
                <button type="button" className="btn-standard" onClick={onClose}>
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
