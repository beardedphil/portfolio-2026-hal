import { useState, useEffect } from 'react'

interface IntegrationManifest {
  manifest_id: string
  repo_full_name: string
  default_branch: string
  schema_version: string
  env_identifiers: Record<string, string>
  goal: string
  stack: string[]
  constraints: string[]
  conventions: string[]
  content_hash: string
  previous_version_id: string | null
  created_at: string
  created_by: string | null
}

interface IntegrationManifestModalProps {
  isOpen: boolean
  onClose: () => void
  repoFullName: string | null
  defaultBranch: string
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
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isNewVersion, setIsNewVersion] = useState(false)

  useEffect(() => {
    if (!isOpen || !repoFullName) return
    setManifest(null)
    setError(null)
    setLoading(true)
    setRegenerating(false)
    setIsNewVersion(false)

    async function load() {
      if (!supabaseUrl || !supabaseAnonKey) {
        setError('Supabase credentials not available')
        setLoading(false)
        return
      }

      try {
        const res = await fetch('/api/manifests/get', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            repoFullName,
            supabaseUrl,
            supabaseAnonKey,
          }),
        })

        const data = await res.json()
        if (data.success && data.manifest) {
          setManifest(data.manifest)
        } else {
          // Manifest doesn't exist yet, that's okay
          setManifest(null)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [isOpen, repoFullName, supabaseUrl, supabaseAnonKey])

  async function handleRegenerate() {
    if (!repoFullName || !supabaseUrl || !supabaseAnonKey) {
      setError('Missing required information')
      return
    }

    setRegenerating(true)
    setError(null)
    setIsNewVersion(false)

    try {
      const res = await fetch('/api/manifests/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoFullName,
          defaultBranch,
          schemaVersion: 'v0',
          envIdentifiers: {},
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const data = await res.json()
      if (data.success && data.manifest) {
        setManifest(data.manifest)
        setIsNewVersion(data.is_new_version || false)
      } else {
        setError(data.error || 'Failed to regenerate manifest')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRegenerating(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="conversation-modal-overlay" onClick={onClose}>
      <div
        className="conversation-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        <div className="conversation-modal-header">
          <h3>Integration Manifest v0</h3>
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
          {loading && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--hal-text-muted)' }}>
              Loading manifest...
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
          {!loading && !error && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Manifest Information</h4>
                  <p style={{ margin: '0.5rem 0 0 0', color: 'var(--hal-text-muted)', fontSize: '0.9rem' }}>
                    {repoFullName} • {defaultBranch} • Schema: v0
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-standard"
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  style={{ minWidth: '180px' }}
                >
                  {regenerating ? 'Regenerating...' : 'Regenerate Manifest'}
                </button>
              </div>

              {isNewVersion && (
                <div
                  style={{
                    padding: '0.75rem',
                    background: 'rgba(40, 198, 40, 0.1)',
                    border: '1px solid var(--hal-status-success)',
                    borderRadius: '6px',
                    color: 'var(--hal-status-success)',
                  }}
                >
                  ✓ New version created
                </div>
              )}

              {manifest && (
                <>
                  <div
                    style={{
                      padding: '0.75rem',
                      background: 'var(--hal-surface-alt)',
                      border: '1px solid var(--hal-border)',
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                      fontFamily: 'monospace',
                      wordBreak: 'break-all',
                    }}
                  >
                    <strong>Version ID:</strong> {manifest.manifest_id}
                    <br />
                    <strong>Content Hash:</strong> {manifest.content_hash.substring(0, 16)}...
                    {manifest.previous_version_id && (
                      <>
                        <br />
                        <strong>Previous Version:</strong> {manifest.previous_version_id}
                      </>
                    )}
                    <br />
                    <strong>Created:</strong> {new Date(manifest.created_at).toLocaleString()}
                    {manifest.created_by && (
                      <>
                        <br />
                        <strong>Created By:</strong> {manifest.created_by}
                      </>
                    )}
                  </div>

                  <section>
                    <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1.1rem', fontWeight: 600 }}>Goal</h4>
                    <div
                      style={{
                        padding: '1rem',
                        background: 'var(--hal-surface-alt)',
                        border: '1px solid var(--hal-border)',
                        borderRadius: '6px',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {manifest.goal || '(not specified)'}
                    </div>
                  </section>

                  <section>
                    <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1.1rem', fontWeight: 600 }}>Stack</h4>
                    {manifest.stack.length === 0 ? (
                      <p style={{ color: 'var(--hal-text-muted)' }}>No stack information available</p>
                    ) : (
                      <div
                        style={{
                          padding: '1rem',
                          background: 'var(--hal-surface-alt)',
                          border: '1px solid var(--hal-border)',
                          borderRadius: '6px',
                        }}
                      >
                        <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                          {manifest.stack.map((item, idx) => (
                            <li key={idx} style={{ marginBottom: '0.5rem' }}>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </section>

                  <section>
                    <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1.1rem', fontWeight: 600 }}>Constraints</h4>
                    {manifest.constraints.length === 0 ? (
                      <p style={{ color: 'var(--hal-text-muted)' }}>No constraints specified</p>
                    ) : (
                      <div
                        style={{
                          padding: '1rem',
                          background: 'var(--hal-surface-alt)',
                          border: '1px solid var(--hal-border)',
                          borderRadius: '6px',
                        }}
                      >
                        <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                          {manifest.constraints.map((item, idx) => (
                            <li key={idx} style={{ marginBottom: '0.5rem', whiteSpace: 'pre-wrap' }}>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </section>

                  <section>
                    <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1.1rem', fontWeight: 600 }}>Conventions</h4>
                    {manifest.conventions.length === 0 ? (
                      <p style={{ color: 'var(--hal-text-muted)' }}>No conventions specified</p>
                    ) : (
                      <div
                        style={{
                          padding: '1rem',
                          background: 'var(--hal-surface-alt)',
                          border: '1px solid var(--hal-border)',
                          borderRadius: '6px',
                          maxHeight: '400px',
                          overflow: 'auto',
                        }}
                      >
                        <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                          {manifest.conventions.map((item, idx) => (
                            <li key={idx} style={{ marginBottom: '0.75rem', whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </section>
                </>
              )}

              {!manifest && !loading && !error && (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--hal-text-muted)' }}>
                  <p>No manifest found for this repository.</p>
                  <p style={{ marginTop: '1rem' }}>
                    <button type="button" className="btn-standard" onClick={handleRegenerate} disabled={regenerating}>
                      {regenerating ? 'Generating...' : 'Generate Manifest'}
                    </button>
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
