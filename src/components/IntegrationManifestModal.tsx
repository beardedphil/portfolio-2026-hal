import { useState, useEffect } from 'react'

interface IntegrationManifest {
  manifest_id: string
  repo_full_name: string
  default_branch: string
  schema_version: string
  goal: string
  stack: string[]
  constraints: string[]
  conventions: string[]
  content_checksum: string
  previous_version_id: string | null
  created_at: string
}

interface IntegrationManifestModalProps {
  isOpen: boolean
  onClose: () => void
  repoFullName: string | null
  defaultBranch: string | null
  supabaseUrl: string | null
  supabaseAnonKey: string | null
}

export function IntegrationManifestModal({
  isOpen,
  onClose,
  repoFullName,
  defaultBranch,
  supabaseUrl,
  supabaseAnonKey,
}: IntegrationManifestModalProps) {
  const [manifest, setManifest] = useState<IntegrationManifest | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isNewVersion, setIsNewVersion] = useState<boolean | null>(null)
  const [regenerating, setRegenerating] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setManifest(null)
      setError(null)
      setIsNewVersion(null)
      setRegenerating(false)
      return
    }
  }, [isOpen])

  const handleRegenerate = async () => {
    if (!repoFullName || !defaultBranch || !supabaseUrl || !supabaseAnonKey) {
      setError('Repository information is required to regenerate manifest.')
      return
    }

    setRegenerating(true)
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/manifests/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoFullName,
          defaultBranch,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const data = await res.json()

      if (!data.success) {
        setError(data.error || 'Failed to regenerate manifest.')
        setLoading(false)
        setRegenerating(false)
        return
      }

      setManifest(data.manifest)
      setIsNewVersion(data.is_new_version)
      setLoading(false)
      setRegenerating(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate manifest.')
      setLoading(false)
      setRegenerating(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Integration Manifest v0</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-body">
          {!repoFullName || !defaultBranch ? (
            <div className="error-message">
              Repository information is required. Please connect a GitHub repository first.
            </div>
          ) : (
            <>
              <div className="manifest-actions">
                <button
                  type="button"
                  className="btn-standard"
                  onClick={handleRegenerate}
                  disabled={regenerating || loading}
                >
                  {regenerating ? 'Regenerating...' : 'Regenerate Integration Manifest'}
                </button>
              </div>

              {error && <div className="error-message">{error}</div>}

              {loading && <div className="loading-message">Loading...</div>}

              {manifest && (
                <div className="manifest-display">
                  <div className="manifest-header">
                    <div className="manifest-version-info">
                      <strong>Version ID:</strong> <code>{manifest.manifest_id}</code>
                    </div>
                    {isNewVersion !== null && (
                      <div className={`manifest-status ${isNewVersion ? 'new' : 'reused'}`}>
                        {isNewVersion ? '🆕 New Version' : '♻️ Reused Existing Version'}
                      </div>
                    )}
                    <div className="manifest-meta">
                      <div>
                        <strong>Repository:</strong> {manifest.repo_full_name}
                      </div>
                      <div>
                        <strong>Branch:</strong> {manifest.default_branch}
                      </div>
                      <div>
                        <strong>Schema:</strong> {manifest.schema_version}
                      </div>
                      <div>
                        <strong>Created:</strong> {new Date(manifest.created_at).toLocaleString()}
                      </div>
                      {manifest.previous_version_id && (
                        <div>
                          <strong>Previous Version:</strong> <code>{manifest.previous_version_id}</code>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="manifest-content">
                    <div className="manifest-section">
                      <h3>Goal</h3>
                      <p>{manifest.goal}</p>
                    </div>

                    <div className="manifest-section">
                      <h3>Stack ({manifest.stack.length} items)</h3>
                      {manifest.stack.length > 0 ? (
                        <ul>
                          {manifest.stack.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="empty-state">No stack items found.</p>
                      )}
                    </div>

                    <div className="manifest-section">
                      <h3>Constraints ({manifest.constraints.length} items)</h3>
                      {manifest.constraints.length > 0 ? (
                        <ul>
                          {manifest.constraints.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="empty-state">No constraints found.</p>
                      )}
                    </div>

                    <div className="manifest-section">
                      <h3>Conventions ({manifest.conventions.length} items)</h3>
                      {manifest.conventions.length > 0 ? (
                        <ul>
                          {manifest.conventions.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="empty-state">No conventions found.</p>
                      )}
                    </div>

                    <div className="manifest-section">
                      <h3>Content Checksum</h3>
                      <code className="checksum">{manifest.content_checksum}</code>
                    </div>
                  </div>
                </div>
              )}

              {!manifest && !loading && !error && (
                <div className="empty-state">
                  Click "Regenerate Integration Manifest" to generate a manifest for this repository.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
