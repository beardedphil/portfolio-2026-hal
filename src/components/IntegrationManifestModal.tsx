import { useState, useEffect } from 'react'

interface IntegrationManifest {
  manifest_id: string
  repo_full_name: string
  default_branch: string
  schema_version: string
  manifest_json: {
    schema_version: string
    repo_full_name: string
    default_branch: string
    goal: string
    stack: string[]
    constraints: string[]
    conventions: string[]
    generated_at: string
    sources: {
      goal?: string[]
      stack?: string[]
      constraints?: string[]
      conventions?: string[]
    }
  }
  content_checksum: string
  version_id: string
  previous_version_id: string | null
  created_at: string
  created_by: string | null
}

interface IntegrationManifestModalProps {
  isOpen: boolean
  onClose: () => void
  repoFullName: string | null
  defaultBranch: string | null
}

export function IntegrationManifestModal({
  isOpen,
  onClose,
  repoFullName,
  defaultBranch,
}: IntegrationManifestModalProps) {
  const [manifest, setManifest] = useState<IntegrationManifest | null>(null)
  const [loading, setLoading] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isNewVersion, setIsNewVersion] = useState<boolean | null>(null)
  const [versionId, setVersionId] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setError(null)
    setManifest(null)
    setIsNewVersion(null)
    setVersionId(null)
    if (repoFullName && defaultBranch) {
      loadManifest()
    }
  }, [isOpen, repoFullName, defaultBranch])

  async function loadManifest() {
    if (!repoFullName) {
      setError('Missing required configuration (repo)')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/manifests/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoFullName,
          versionId: 'latest',
        }),
      })

      const data = await res.json()

      if (!data.success) {
        if (data.error?.includes('No manifest found')) {
          // No manifest exists yet - this is OK, user can regenerate
          setManifest(null)
          setLoading(false)
          return
        }
        throw new Error(data.error || 'Failed to load manifest')
      }

      setManifest(data.manifest)
      setVersionId(data.manifest.version_id)
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setLoading(false)
    }
  }

  async function handleRegenerate() {
    if (!repoFullName || !defaultBranch) {
      setError('Missing required configuration (repo, branch)')
      return
    }

    setRegenerating(true)
    setError(null)

    try {
      const res = await fetch('/api/manifests/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoFullName,
          defaultBranch,
          schemaVersion: 'v0',
        }),
      })

      const data = await res.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to regenerate manifest')
      }

      setManifest(data.manifest)
      setIsNewVersion(data.is_new_version)
      setVersionId(data.version_id)
      setRegenerating(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setRegenerating(false)
    }
  }

  if (!isOpen) return null

  const manifestContent = manifest?.manifest_json

  return (
    <div className="conversation-modal-overlay" onClick={onClose}>
      <div
        className="conversation-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        <div className="conversation-modal-header">
          <h3>Integration Manifest</h3>
          <button
            type="button"
            className="conversation-modal-close btn-destructive"
            onClick={onClose}
            aria-label="Close integration manifest"
          >
            ×
          </button>
        </div>
        <div className="conversation-modal-content" style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
          {!repoFullName || !defaultBranch ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--hal-text-muted)' }}>
              No repository connected. Please connect a GitHub repository first.
            </div>
          ) : (
            <>
              <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn-standard"
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  style={{ flexShrink: 0 }}
                >
                  {regenerating ? 'Regenerating...' : 'Regenerate Integration Manifest'}
                </button>
                {isNewVersion !== null && (
                  <span
                    style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '4px',
                      fontSize: '0.85rem',
                      background: isNewVersion ? 'rgba(40, 167, 69, 0.1)' : 'rgba(108, 117, 125, 0.1)',
                      color: isNewVersion ? 'var(--hal-status-success)' : 'var(--hal-text-muted)',
                    }}
                  >
                    {isNewVersion ? 'New version created' : 'Reused existing version'}
                  </span>
                )}
              </div>

              {loading && (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--hal-text-muted)' }}>
                  Loading manifest...
                </div>
              )}

              {regenerating && (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--hal-text-muted)' }}>
                  Regenerating manifest...
                </div>
              )}

              {error && (
                <div
                  style={{
                    padding: '1rem',
                    background: 'rgba(198, 40, 40, 0.1)',
                    border: '1px solid var(--hal-status-error)',
                    borderRadius: '6px',
                    color: 'var(--hal-status-error)',
                    marginBottom: '1rem',
                  }}
                >
                  {error}
                </div>
              )}

              {!loading && !regenerating && !error && manifest && manifestContent && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                  <section>
                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 600 }}>Version Information</h4>
                    <div style={{ fontSize: '0.9rem', color: 'var(--hal-text-muted)', fontFamily: 'monospace' }}>
                      <div>Version ID: {versionId || manifest.version_id}</div>
                      <div>Schema Version: {manifest.schema_version}</div>
                      <div>Created: {new Date(manifest.created_at).toLocaleString()}</div>
                      {manifest.previous_version_id && (
                        <div>Previous Version: {manifest.previous_version_id.substring(0, 16)}...</div>
                      )}
                    </div>
                  </section>

                  <section>
                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 600 }}>Goal</h4>
                    <p style={{ margin: 0, color: 'var(--hal-text)', whiteSpace: 'pre-wrap' }}>{manifestContent.goal}</p>
                    {manifestContent.sources.goal && manifestContent.sources.goal.length > 0 && (
                      <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: 'var(--hal-text-muted)' }}>
                        Sources: {manifestContent.sources.goal.join(', ')}
                      </p>
                    )}
                  </section>

                  <section>
                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 600 }}>Stack</h4>
                    {manifestContent.stack.length === 0 ? (
                      <p style={{ color: 'var(--hal-text-muted)' }}>No stack information available</p>
                    ) : (
                      <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                        {manifestContent.stack.map((item, idx) => (
                          <li key={idx} style={{ marginBottom: '0.25rem' }}>
                            {item}
                          </li>
                        ))}
                      </ul>
                    )}
                    {manifestContent.sources.stack && manifestContent.sources.stack.length > 0 && (
                      <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: 'var(--hal-text-muted)' }}>
                        Sources: {manifestContent.sources.stack.join(', ')}
                      </p>
                    )}
                  </section>

                  <section>
                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 600 }}>Constraints</h4>
                    {manifestContent.constraints.length === 0 ? (
                      <p style={{ color: 'var(--hal-text-muted)' }}>No constraints defined</p>
                    ) : (
                      <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                        {manifestContent.constraints.map((item, idx) => (
                          <li key={idx} style={{ marginBottom: '0.25rem' }}>
                            {item}
                          </li>
                        ))}
                      </ul>
                    )}
                    {manifestContent.sources.constraints && manifestContent.sources.constraints.length > 0 && (
                      <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: 'var(--hal-text-muted)' }}>
                        Sources: {manifestContent.sources.constraints.join(', ')}
                      </p>
                    )}
                  </section>

                  <section>
                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 600 }}>Conventions</h4>
                    {manifestContent.conventions.length === 0 ? (
                      <p style={{ color: 'var(--hal-text-muted)' }}>No conventions defined</p>
                    ) : (
                      <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                        {manifestContent.conventions.map((item, idx) => (
                          <li key={idx} style={{ marginBottom: '0.25rem' }}>
                            {item}
                          </li>
                        ))}
                      </ul>
                    )}
                    {manifestContent.sources.conventions && manifestContent.sources.conventions.length > 0 && (
                      <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: 'var(--hal-text-muted)' }}>
                        Sources: {manifestContent.sources.conventions.join(', ')}
                      </p>
                    )}
                  </section>

                  <section>
                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 600 }}>Raw Manifest JSON</h4>
                    <pre
                      style={{
                        padding: '1rem',
                        background: 'var(--hal-surface-alt)',
                        border: '1px solid var(--hal-border)',
                        borderRadius: '6px',
                        overflow: 'auto',
                        fontSize: '0.85rem',
                        fontFamily: 'monospace',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {JSON.stringify(manifestContent, null, 2)}
                    </pre>
                  </section>
                </div>
              )}

              {!loading && !regenerating && !error && !manifest && (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--hal-text-muted)' }}>
                  No manifest found. Click "Regenerate Integration Manifest" to create one.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
