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

interface EmbeddingJob {
  job_id: string
  artifact_id: string
  status: 'queued' | 'processing' | 'succeeded' | 'failed'
  created_at: string
  started_at?: string
  completed_at?: string
  chunks_processed?: number
  chunks_skipped?: number
  chunks_failed?: number
  error_message?: string
}

interface EmbeddingStats {
  queued: number
  processing: number
  succeeded: number
  failed: number
  total: number
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
  ticketId?: string | null
  ticketPk?: string | null
}

export function DiagnosticsModal({
  isOpen,
  onClose,
  supabaseUrl,
  supabaseAnonKey,
  openaiApiKey,
  ticketId,
  ticketPk,
}: DiagnosticsModalProps) {
  const [embeddingsStatus, setEmbeddingsStatus] = useState<EmbeddingsStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [embeddingJobs, setEmbeddingJobs] = useState<EmbeddingJob[]>([])
  const [embeddingStats, setEmbeddingStats] = useState<EmbeddingStats | null>(null)
  const [loadingJobs, setLoadingJobs] = useState(false)

  // Load embeddings status and jobs when modal opens
  useEffect(() => {
    if (!isOpen) return
    loadEmbeddingsStatus()
    if (ticketId || ticketPk) {
      loadEmbeddingJobs()
    }
  }, [isOpen, supabaseUrl, supabaseAnonKey, ticketId, ticketPk])

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

  async function loadEmbeddingJobs() {
    if (!supabaseUrl || !supabaseAnonKey || (!ticketId && !ticketPk)) {
      return
    }

    setLoadingJobs(true)
    try {
      const res = await fetch('/api/artifacts/get-diagnostics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId,
          ticketPk,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const data = (await res.json()) as {
        success: boolean
        embeddingJobs?: EmbeddingJob[]
        embeddingStats?: EmbeddingStats
        error?: string
      }

      if (data.success) {
        setEmbeddingJobs(data.embeddingJobs || [])
        setEmbeddingStats(data.embeddingStats || null)
      }
    } catch (err) {
      console.error('Failed to load embedding jobs:', err)
    } finally {
      setLoadingJobs(false)
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
          {/* Embedding Jobs Queue / Worker Status Section */}
          {(ticketId || ticketPk) && (
            <section style={{ marginBottom: '2rem' }}>
              <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 600 }}>Embedding Jobs Queue</h4>
              {loadingJobs ? (
                <p style={{ color: 'var(--hal-text-muted)' }}>Loading jobs...</p>
              ) : embeddingStats ? (
                <div>
                  <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ padding: '0.5rem 1rem', background: 'var(--hal-surface-alt)', borderRadius: '4px' }}>
                      <div style={{ fontSize: '0.85rem', color: 'var(--hal-text-muted)', marginBottom: '0.25rem' }}>Queued</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--hal-text)' }}>{embeddingStats.queued}</div>
                    </div>
                    <div style={{ padding: '0.5rem 1rem', background: 'var(--hal-surface-alt)', borderRadius: '4px' }}>
                      <div style={{ fontSize: '0.85rem', color: 'var(--hal-text-muted)', marginBottom: '0.25rem' }}>Processing</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--hal-status-ok)' }}>{embeddingStats.processing}</div>
                    </div>
                    <div style={{ padding: '0.5rem 1rem', background: 'var(--hal-surface-alt)', borderRadius: '4px' }}>
                      <div style={{ fontSize: '0.85rem', color: 'var(--hal-text-muted)', marginBottom: '0.25rem' }}>Succeeded</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--hal-status-ok)' }}>{embeddingStats.succeeded}</div>
                    </div>
                    <div style={{ padding: '0.5rem 1rem', background: 'var(--hal-surface-alt)', borderRadius: '4px' }}>
                      <div style={{ fontSize: '0.85rem', color: 'var(--hal-text-muted)', marginBottom: '0.25rem' }}>Failed</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--hal-status-error)' }}>{embeddingStats.failed}</div>
                    </div>
                    <div style={{ padding: '0.5rem 1rem', background: 'var(--hal-surface-alt)', borderRadius: '4px' }}>
                      <div style={{ fontSize: '0.85rem', color: 'var(--hal-text-muted)', marginBottom: '0.25rem' }}>Total</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--hal-text)' }}>{embeddingStats.total}</div>
                    </div>
                  </div>

                  {/* Recent Jobs List */}
                  {embeddingJobs.length > 0 && (
                    <div>
                      <h5 style={{ margin: '1rem 0 0.5rem 0', fontSize: '1rem', fontWeight: 600 }}>Recent Jobs</h5>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {embeddingJobs.slice(0, 10).map((job) => (
                          <div
                            key={job.job_id}
                            style={{
                              padding: '0.75rem',
                              border: '1px solid var(--hal-border)',
                              borderRadius: '4px',
                              background: 'var(--hal-surface-alt)',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.25rem' }}>
                              <span
                                style={{
                                  padding: '0.25rem 0.5rem',
                                  borderRadius: '3px',
                                  fontSize: '0.85rem',
                                  fontWeight: 500,
                                  background:
                                    job.status === 'succeeded'
                                      ? 'rgba(46, 125, 50, 0.1)'
                                      : job.status === 'failed'
                                        ? 'rgba(198, 40, 40, 0.1)'
                                        : job.status === 'processing'
                                          ? 'rgba(33, 150, 243, 0.1)'
                                          : 'rgba(108, 117, 125, 0.1)',
                                  color:
                                    job.status === 'succeeded'
                                      ? 'var(--hal-status-ok)'
                                      : job.status === 'failed'
                                        ? 'var(--hal-status-error)'
                                        : job.status === 'processing'
                                          ? '#2196F3'
                                          : 'var(--hal-text-muted)',
                                }}
                              >
                                {job.status.toUpperCase()}
                              </span>
                              <span style={{ fontSize: '0.85rem', color: 'var(--hal-text-muted)' }}>
                                {new Date(job.created_at).toLocaleString()}
                              </span>
                            </div>
                            {(job.chunks_processed !== undefined || job.chunks_skipped !== undefined || job.chunks_failed !== undefined) && (
                              <div style={{ fontSize: '0.85rem', color: 'var(--hal-text-muted)', marginTop: '0.25rem' }}>
                                Processed: {job.chunks_processed || 0} | Skipped: {job.chunks_skipped || 0} | Failed: {job.chunks_failed || 0}
                              </div>
                            )}
                            {job.error_message && (
                              <div style={{ fontSize: '0.85rem', color: 'var(--hal-status-error)', marginTop: '0.25rem' }}>
                                Error: {job.error_message}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p style={{ color: 'var(--hal-text-muted)' }}>No embedding jobs found</p>
              )}
            </section>
          )}

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
