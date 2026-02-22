import { useState, useEffect } from 'react'

interface EmbeddingsStatus {
  success: boolean
  status: 'enabled' | 'disabled' | 'error'
  reason: string
  pgvectorEnabled?: boolean
  tableExists?: boolean
  hasEmbeddings?: boolean
  chunkCount?: number
  error?: string
}

interface SearchResult {
  chunk_id: string
  artifact_id: string
  ticket_pk: string | null
  title: string
  snippet: string
  similarity: number
}

interface DiagnosticsModalProps {
  isOpen: boolean
  onClose: () => void
  supabaseUrl: string | null
  supabaseAnonKey: string | null
  openaiApiKey?: string | null
  connectedGithubRepo?: { fullName: string } | null
}

export function DiagnosticsModal({
  isOpen,
  onClose,
  supabaseUrl,
  supabaseAnonKey,
  openaiApiKey,
  connectedGithubRepo,
}: DiagnosticsModalProps) {
  const [embeddingsStatus, setEmbeddingsStatus] = useState<EmbeddingsStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [repoInitStatus, setRepoInitStatus] = useState<{
    loading: boolean
    success: boolean | null
    message: string | null
    default_branch: string | null
    initial_commit_sha: string | null
    alreadyInitialized: boolean | null
  }>({
    loading: false,
    success: null,
    message: null,
    default_branch: null,
    initial_commit_sha: null,
    alreadyInitialized: null,
  })

  // Load embeddings status when modal opens
  useEffect(() => {
    if (!isOpen) return
    loadEmbeddingsStatus()
  }, [isOpen, supabaseUrl, supabaseAnonKey])

  async function loadEmbeddingsStatus() {
    if (!supabaseUrl || !supabaseAnonKey) {
      setEmbeddingsStatus({
        success: false,
        status: 'error',
        reason: 'Supabase credentials not configured',
      })
      return
    }

    setLoadingStatus(true)
    try {
      const res = await fetch('/api/artifacts/embeddings-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const data = (await res.json()) as EmbeddingsStatus
      setEmbeddingsStatus(data)
    } catch (err) {
      setEmbeddingsStatus({
        success: false,
        status: 'error',
        reason: err instanceof Error ? err.message : 'Failed to check embeddings status',
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setLoadingStatus(false)
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) {
      setSearchError('Please enter a search query')
      return
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      setSearchError('Supabase credentials not configured')
      return
    }

    if (!openaiApiKey) {
      setSearchError('OpenAI API key not configured')
      return
    }

    setSearching(true)
    setSearchError(null)
    setSearchResults([])

    try {
      const res = await fetch('/api/artifacts/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          limit: 10,
          supabaseUrl,
          supabaseAnonKey,
          openaiApiKey,
        }),
      })

      const data = (await res.json()) as {
        success: boolean
        results: SearchResult[]
        error?: string
      }

      if (!data.success) {
        setSearchError(data.error || 'Search failed')
        return
      }

      setSearchResults(data.results || [])
      if (data.results.length === 0) {
        setSearchError('No results found. Try a different query.')
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setSearching(false)
    }
  }

  async function handleResultClick(result: SearchResult) {
    if (!result.ticket_pk || !supabaseUrl || !supabaseAnonKey) {
      alert(`Artifact: ${result.title}\n\nSnippet: ${result.snippet}`)
      return
    }

    // Try to fetch ticket info to get display ID
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/tickets?pk=eq.${result.ticket_pk}&select=display_id,ticket_number,title`, {
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
      })
      const tickets = await res.json()
      const ticket = tickets?.[0]
      const ticketId = ticket?.display_id || ticket?.ticket_number || result.ticket_pk.substring(0, 8)

      // Show ticket info - in a real implementation, this would open the ticket detail modal
      // For now, we'll show an alert with the info and note that navigation should be implemented
      alert(
        `Ticket: ${ticketId}\nArtifact: ${result.title}\n\nSnippet: ${result.snippet}\n\nNote: Full navigation to ticket detail will be implemented in a future update.`
      )
    } catch (err) {
      // Fallback: just show the artifact info
      alert(`Artifact: ${result.title}\n\nSnippet: ${result.snippet}`)
    }
  }

  async function handleEnsureRepoInitialized() {
    if (!connectedGithubRepo?.fullName) {
      setRepoInitStatus({
        loading: false,
        success: false,
        message: 'No GitHub repository connected. Please connect a repository first.',
        default_branch: null,
        initial_commit_sha: null,
        alreadyInitialized: null,
      })
      return
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      setRepoInitStatus({
        loading: false,
        success: false,
        message: 'Supabase credentials not configured.',
        default_branch: null,
        initial_commit_sha: null,
        alreadyInitialized: null,
      })
      return
    }

    setRepoInitStatus({
      loading: true,
      success: null,
      message: null,
      default_branch: null,
      initial_commit_sha: null,
      alreadyInitialized: null,
    })

    try {
      const res = await fetch('/api/github/ensure-initialized', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoFullName: connectedGithubRepo.fullName,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const data = (await res.json()) as {
        success: boolean
        alreadyInitialized?: boolean
        default_branch?: string
        initial_commit_sha?: string
        error?: string
      }

      if (!data.success) {
        setRepoInitStatus({
          loading: false,
          success: false,
          message: data.error || 'Failed to initialize repository',
          default_branch: null,
          initial_commit_sha: null,
          alreadyInitialized: null,
        })
        return
      }

      setRepoInitStatus({
        loading: false,
        success: true,
        message: data.alreadyInitialized
          ? 'Repository is already initialized.'
          : 'Repository initialized successfully. A main branch with an initial commit has been created.',
        default_branch: data.default_branch || null,
        initial_commit_sha: data.initial_commit_sha || null,
        alreadyInitialized: data.alreadyInitialized || false,
      })
    } catch (err) {
      setRepoInitStatus({
        loading: false,
        success: false,
        message: err instanceof Error ? err.message : 'Failed to initialize repository',
        default_branch: null,
        initial_commit_sha: null,
        alreadyInitialized: null,
      })
    }
  }

  if (!isOpen) return null

  return (
    <div className="conversation-modal-overlay" onClick={onClose}>
      <div className="conversation-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="conversation-modal-header">
          <h3>Diagnostics</h3>
          <button
            type="button"
            className="conversation-modal-close btn-destructive"
            onClick={onClose}
            aria-label="Close diagnostics"
          >
            ×
          </button>
        </div>

        <div className="conversation-modal-content" style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
          {/* Secrets Encryption Status Section */}
          <section style={{ marginBottom: '2rem' }}>
            <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 600 }}>Secrets Encryption</h4>
            <div>
              <div
                style={{
                  display: 'inline-block',
                  padding: '0.4rem 0.8rem',
                  borderRadius: '4px',
                  fontWeight: 500,
                  marginBottom: '0.5rem',
                  background: 'rgba(46, 125, 50, 0.1)',
                  color: 'var(--hal-status-ok)',
                  border: '1px solid var(--hal-status-ok)',
                }}
              >
                ✓ Secrets stored encrypted at rest
              </div>
              <p style={{ margin: '0.5rem 0', color: 'var(--hal-text)', fontSize: '0.9rem' }}>
                Provider OAuth tokens and Supabase service keys are encrypted using AES-256-GCM before being stored.
                Raw token/key values are never displayed after initial entry.
              </p>
            </div>
          </section>

          {/* Bootstrap / Diagnostics Section */}
          <section style={{ marginBottom: '2rem' }}>
            <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 600 }}>Bootstrap / Diagnostics</h4>
            <div style={{ marginBottom: '1rem' }}>
              <button
                type="button"
                className="btn-standard"
                onClick={handleEnsureRepoInitialized}
                disabled={repoInitStatus.loading || !connectedGithubRepo?.fullName || !supabaseUrl || !supabaseAnonKey}
                style={{ marginBottom: '0.5rem' }}
              >
                {repoInitStatus.loading ? 'Initializing...' : 'Ensure repo initialized'}
              </button>
              {!connectedGithubRepo?.fullName && (
                <p style={{ color: 'var(--hal-text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                  Connect a GitHub repository to enable this feature.
                </p>
              )}
              {repoInitStatus.message && (
                <div
                  style={{
                    marginTop: '0.5rem',
                    padding: '0.75rem',
                    borderRadius: '4px',
                    background:
                      repoInitStatus.success === true
                        ? 'rgba(46, 125, 50, 0.1)'
                        : repoInitStatus.success === false
                          ? 'rgba(198, 40, 40, 0.1)'
                          : 'rgba(108, 117, 125, 0.1)',
                    color:
                      repoInitStatus.success === true
                        ? 'var(--hal-status-ok)'
                        : repoInitStatus.success === false
                          ? 'var(--hal-status-error)'
                          : 'var(--hal-text)',
                    border:
                      repoInitStatus.success === true
                        ? '1px solid var(--hal-status-ok)'
                        : repoInitStatus.success === false
                          ? '1px solid var(--hal-status-error)'
                          : '1px solid var(--hal-border)',
                  }}
                >
                  {repoInitStatus.message}
                </div>
              )}
              {repoInitStatus.success === true && repoInitStatus.default_branch && (
                <div style={{ marginTop: '0.75rem', fontSize: '0.9rem', color: 'var(--hal-text)' }}>
                  <div style={{ marginBottom: '0.25rem' }}>
                    <strong>Default branch:</strong> {repoInitStatus.default_branch}
                  </div>
                  {repoInitStatus.initial_commit_sha && (
                    <div>
                      <strong>Initial commit SHA:</strong>{' '}
                      <code style={{ fontSize: '0.85em', background: 'var(--hal-surface-alt)', padding: '0.2em 0.4em', borderRadius: '3px' }}>
                        {repoInitStatus.initial_commit_sha}
                      </code>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Embeddings / Vector Search Status Section */}
          <section style={{ marginBottom: '2rem' }}>
            <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 600 }}>Embeddings / Vector Search</h4>
            {loadingStatus ? (
              <p style={{ color: 'var(--hal-text-muted)' }}>Loading status...</p>
            ) : embeddingsStatus ? (
              <div>
                <div
                  style={{
                    display: 'inline-block',
                    padding: '0.4rem 0.8rem',
                    borderRadius: '4px',
                    fontWeight: 500,
                    marginBottom: '0.5rem',
                    background:
                      embeddingsStatus.status === 'enabled'
                        ? 'rgba(46, 125, 50, 0.1)'
                        : embeddingsStatus.status === 'error'
                          ? 'rgba(198, 40, 40, 0.1)'
                          : 'rgba(108, 117, 125, 0.1)',
                    color:
                      embeddingsStatus.status === 'enabled'
                        ? 'var(--hal-status-ok)'
                        : embeddingsStatus.status === 'error'
                          ? 'var(--hal-status-error)'
                          : 'var(--hal-text-muted)',
                    border:
                      embeddingsStatus.status === 'enabled'
                        ? '1px solid var(--hal-status-ok)'
                        : embeddingsStatus.status === 'error'
                          ? '1px solid var(--hal-status-error)'
                          : '1px solid var(--hal-border)',
                  }}
                >
                  {embeddingsStatus.status === 'enabled' ? '✓ Enabled' : embeddingsStatus.status === 'disabled' ? '✗ Disabled' : '⚠ Error'}
                </div>
                <p style={{ margin: '0.5rem 0', color: 'var(--hal-text)' }}>{embeddingsStatus.reason}</p>
                {embeddingsStatus.status === 'enabled' && embeddingsStatus.chunkCount !== undefined && (
                  <p style={{ margin: '0.5rem 0', color: 'var(--hal-text-muted)', fontSize: '0.9rem' }}>
                    Chunks with embeddings: {embeddingsStatus.chunkCount}
                  </p>
                )}
                {embeddingsStatus.error && (
                  <p style={{ margin: '0.5rem 0', color: 'var(--hal-status-error)' }}>Error: {embeddingsStatus.error}</p>
                )}
              </div>
            ) : (
              <p style={{ color: 'var(--hal-text-muted)' }}>Failed to load status</p>
            )}
          </section>

          {/* Vector Search Section */}
          {embeddingsStatus?.status === 'enabled' && (
            <section style={{ marginTop: '2rem' }}>
              <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 600 }}>Vector Search</h4>
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <input
                    type="text"
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      border: '1px solid var(--hal-border)',
                      borderRadius: '4px',
                      background: 'var(--hal-surface)',
                      color: 'var(--hal-text)',
                    }}
                    placeholder="Enter search query (e.g., 'ticket readiness checklist')"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !searching) {
                        handleSearch()
                      }
                    }}
                    disabled={searching || !openaiApiKey}
                  />
                  <button
                    type="button"
                    className="btn-standard"
                    onClick={handleSearch}
                    disabled={searching || !openaiApiKey || !searchQuery.trim()}
                  >
                    {searching ? 'Searching...' : 'Search'}
                  </button>
                </div>
                {!openaiApiKey && (
                  <p style={{ color: 'var(--hal-text-muted)', fontSize: '0.9rem' }}>
                    OpenAI API key not configured. Cannot perform searches.
                  </p>
                )}
                {searchError && (
                  <p style={{ color: 'var(--hal-status-error)', fontSize: '0.9rem', marginTop: '0.5rem' }}>{searchError}</p>
                )}
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div>
                  <h5 style={{ margin: '1rem 0 0.5rem 0', fontSize: '1rem', fontWeight: 600 }}>
                    Results ({searchResults.length})
                  </h5>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {searchResults.map((result) => (
                      <div
                        key={result.chunk_id}
                        onClick={() => handleResultClick(result)}
                        style={{
                          cursor: 'pointer',
                          padding: '1rem',
                          border: '1px solid var(--hal-border)',
                          borderRadius: '6px',
                          background: 'var(--hal-surface-alt)',
                          transition: 'background 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--hal-surface)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'var(--hal-surface-alt)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                          <span style={{ fontWeight: 600, color: 'var(--hal-text)' }}>{result.title}</span>
                          <span style={{ color: 'var(--hal-text-muted)', fontSize: '0.9rem' }}>
                            {(result.similarity * 100).toFixed(1)}% match
                          </span>
                        </div>
                        <p style={{ margin: '0.5rem 0', color: 'var(--hal-text)', fontSize: '0.9rem' }}>{result.snippet}</p>
                        {result.ticket_pk && (
                          <span style={{ color: 'var(--hal-text-muted)', fontSize: '0.85rem' }}>
                            Ticket: {result.ticket_pk.substring(0, 8)}...
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
