import { useState } from 'react'
import type { ConnectedGithubRepo } from '../types/app'

interface IntegrationManifestModalProps {
  isOpen: boolean
  onClose: () => void
  connectedRepo: ConnectedGithubRepo | null
  supabaseUrl: string | null
  supabaseAnonKey: string | null
}

interface ManifestResult {
  manifestId: string
  versionNumber: number
  contentHash: string
  manifestContent: {
    goal: string
    stack: string[]
    constraints: string[]
    conventions: string[]
  }
  isNewVersion: boolean
  previousVersionId?: string
}

export function IntegrationManifestModal({
  isOpen,
  onClose,
  connectedRepo,
  supabaseUrl,
  supabaseAnonKey,
}: IntegrationManifestModalProps) {
  const [loading, setLoading] = useState(false)
  const [manifest, setManifest] = useState<ManifestResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleRegenerate = async () => {
    if (!connectedRepo || !supabaseUrl || !supabaseAnonKey) {
      setError('Repository and Supabase configuration required')
      return
    }

    setLoading(true)
    setError(null)
    setManifest(null)

    try {
      const baseUrl = window.location.origin
      const response = await fetch(`${baseUrl}/api/manifests/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoFullName: connectedRepo.fullName,
          defaultBranch: connectedRepo.defaultBranch || 'main',
          schemaVersion: 'v0',
          envIdentifiers: {},
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const result = await response.json()

      if (!result.success) {
        setError(result.error || 'Failed to regenerate manifest')
        return
      }

      setManifest(result.manifest)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
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
          {!connectedRepo ? (
            <p>No repository connected. Please connect a GitHub repository first.</p>
          ) : (
            <>
              <div className="manifest-controls">
                <button
                  type="button"
                  className="btn-standard"
                  onClick={handleRegenerate}
                  disabled={loading}
                >
                  {loading ? 'Regenerating...' : 'Regenerate Integration Manifest'}
                </button>
              </div>

              {error && (
                <div className="manifest-error" style={{ color: 'red', marginTop: '1rem' }}>
                  Error: {error}
                </div>
              )}

              {manifest && (
                <div className="manifest-result" style={{ marginTop: '1rem' }}>
                  <div className="manifest-version-info" style={{ marginBottom: '1rem' }}>
                    <h3>Manifest Version</h3>
                    <p>
                      <strong>Version Number:</strong> {manifest.versionNumber}
                    </p>
                    <p>
                      <strong>Content Hash:</strong>{' '}
                      <code style={{ fontSize: '0.85em' }}>{manifest.contentHash}</code>
                    </p>
                    <p>
                      <strong>Status:</strong>{' '}
                      {manifest.isNewVersion ? (
                        <span style={{ color: 'green' }}>New version created</span>
                      ) : (
                        <span style={{ color: 'blue' }}>Reused existing version</span>
                      )}
                    </p>
                    {manifest.previousVersionId && (
                      <p>
                        <strong>Previous Version ID:</strong>{' '}
                        <code style={{ fontSize: '0.85em' }}>{manifest.previousVersionId}</code>
                      </p>
                    )}
                  </div>

                  <div className="manifest-content">
                    <h3>Manifest Content</h3>

                    <div style={{ marginBottom: '1rem' }}>
                      <h4>Goal</h4>
                      <p>{manifest.manifestContent.goal}</p>
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                      <h4>Stack</h4>
                      <ul>
                        {manifest.manifestContent.stack.map((tech, i) => (
                          <li key={i}>{tech}</li>
                        ))}
                      </ul>
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                      <h4>Constraints</h4>
                      {manifest.manifestContent.constraints.length > 0 ? (
                        <ul>
                          {manifest.manifestContent.constraints.map((constraint, i) => (
                            <li key={i} style={{ fontSize: '0.9em', marginBottom: '0.5rem' }}>
                              {constraint}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p style={{ fontStyle: 'italic', color: '#666' }}>No constraints found</p>
                      )}
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                      <h4>Conventions</h4>
                      {manifest.manifestContent.conventions.length > 0 ? (
                        <ul>
                          {manifest.manifestContent.conventions.map((convention, i) => (
                            <li key={i} style={{ fontSize: '0.9em', marginBottom: '0.5rem' }}>
                              {convention}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p style={{ fontStyle: 'italic', color: '#666' }}>No conventions found</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-standard" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
