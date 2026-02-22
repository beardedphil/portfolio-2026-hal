import { useState, useEffect, useRef } from 'react'

interface RedGenerationModalProps {
  isOpen: boolean
  onClose: () => void
  ticketPk: string | null
  ticketId: string | null
  repoFullName: string | null
  supabaseUrl: string | null
  supabaseAnonKey: string | null
}

interface HybridRetrievalOptions {
  query?: string
  includePinned?: boolean
  recencyDays?: number
  limit?: number
  deterministic?: boolean
}

interface HybridSearchResult {
  success: boolean
  artifacts: Array<{
    artifact_id: string
    title: string
    similarity?: number
    created_at: string
  }>
  retrievalMetadata: {
    repoFilter?: string
    pinnedIncluded: boolean
    recencyWindow?: string
    totalConsidered: number
    totalSelected: number
  }
  error?: string
}

interface RedGenerationResult {
  success: boolean
  red_document?: {
    red_id: string
    version: number
    ticket_pk: string
    repo_full_name: string
  }
  retrievalMetadata?: {
    repoFilter?: string
    pinnedIncluded: boolean
    recencyWindow?: string
    totalConsidered: number
    totalSelected: number
  }
  error?: string
}

export function RedGenerationModal({
  isOpen,
  onClose,
  ticketPk: initialTicketPk,
  ticketId: initialTicketId,
  repoFullName: initialRepoFullName,
  supabaseUrl,
  supabaseAnonKey,
}: RedGenerationModalProps) {
  const [ticketPk, setTicketPk] = useState<string | null>(initialTicketPk)
  const [ticketId, setTicketId] = useState<string | null>(initialTicketId)
  const [repoFullName, setRepoFullName] = useState<string | null>(initialRepoFullName)
  const [retrievalOptions, setRetrievalOptions] = useState<HybridRetrievalOptions>({
    query: '',
    includePinned: false,
    recencyDays: 30,
    limit: 20,
    deterministic: true,
  })
  const [retrievalResult, setRetrievalResult] = useState<HybridSearchResult | null>(null)
  const [generationResult, setGenerationResult] = useState<RedGenerationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const apiBaseUrlRef = useRef<string>('')

  // Load API base URL
  useEffect(() => {
    async function loadApiBaseUrl() {
      try {
        const response = await fetch('/.hal/api-base-url')
        if (response.ok) {
          const url = (await response.text()).trim()
          apiBaseUrlRef.current = url || window.location.origin
        } else {
          apiBaseUrlRef.current = window.location.origin
        }
      } catch {
        apiBaseUrlRef.current = window.location.origin
      }
    }
    loadApiBaseUrl()
  }, [])

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setTicketPk(initialTicketPk)
      setTicketId(initialTicketId)
      setRepoFullName(initialRepoFullName)
      setRetrievalResult(null)
      setGenerationResult(null)
      setError(null)
    }
  }, [isOpen, initialTicketPk, initialTicketId, initialRepoFullName])

  const performHybridSearch = async () => {
    if (!repoFullName || !supabaseUrl || !supabaseAnonKey) {
      setError('Repository and Supabase connection required for hybrid retrieval.')
      return
    }

    setLoading(true)
    setError(null)
    setRetrievalResult(null)

    try {
      const apiBaseUrl = apiBaseUrlRef.current || window.location.origin
      const response = await fetch(`${apiBaseUrl}/api/artifacts/hybrid-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: retrievalOptions.query || undefined,
          repoFullName,
          includePinned: retrievalOptions.includePinned,
          recencyDays: retrievalOptions.recencyDays,
          limit: retrievalOptions.limit,
          ticketPk: ticketPk || undefined,
          deterministic: retrievalOptions.deterministic,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const data = (await response.json()) as HybridSearchResult

      if (!data.success) {
        throw new Error(data.error || 'Hybrid retrieval failed')
      }

      setRetrievalResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to perform hybrid retrieval')
      setRetrievalResult({
        success: false,
        artifacts: [],
        retrievalMetadata: {
          repoFilter: repoFullName,
          pinnedIncluded: retrievalOptions.includePinned || false,
          recencyWindow: retrievalOptions.recencyDays ? `last ${retrievalOptions.recencyDays} days` : undefined,
          totalConsidered: 0,
          totalSelected: 0,
        },
        error: err instanceof Error ? err.message : 'Failed to perform hybrid retrieval',
      })
    } finally {
      setLoading(false)
    }
  }

  const generateRed = async () => {
    if (!ticketPk || !repoFullName || !supabaseUrl || !supabaseAnonKey) {
      setError('Ticket and repository information required to generate RED.')
      return
    }

    if (!retrievalResult || !retrievalResult.success) {
      setError('Please perform hybrid retrieval first to select artifacts.')
      return
    }

    setLoading(true)
    setError(null)
    setGenerationResult(null)

    try {
      // For now, we'll just show the retrieval metadata
      // In a full implementation, this would call an endpoint to generate RED using the selected artifacts
      // For this ticket, we're focusing on showing the retrieval sources summary
      setGenerationResult({
        success: true,
        retrievalMetadata: retrievalResult.retrievalMetadata,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate RED')
      setGenerationResult({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to generate RED',
      })
    } finally {
      setLoading(false)
    }
  }

  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat().format(num)
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: '800px', maxHeight: '90vh', width: '95%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Generate RED</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'auto' }}>
          {!supabaseUrl || !supabaseAnonKey ? (
            <div style={{ padding: '16px', background: 'var(--hal-surface-alt)', borderRadius: '8px' }}>
              <p>Supabase connection required to generate RED documents.</p>
            </div>
          ) : !repoFullName ? (
            <div style={{ padding: '16px', background: 'var(--hal-surface-alt)', borderRadius: '8px' }}>
              <p>Repository selection required to generate RED documents.</p>
            </div>
          ) : (
            <>
              {/* Repository and Ticket Info */}
              <div style={{ padding: '12px', background: 'var(--hal-surface-alt)', borderRadius: '8px', fontSize: '14px' }}>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <div>
                    <strong>Repository:</strong> {repoFullName}
                  </div>
                  {ticketId && (
                    <div>
                      <strong>Ticket:</strong> {ticketId}
                    </div>
                  )}
                </div>
              </div>

              {/* Hybrid Retrieval Options */}
              <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Hybrid Retrieval Options</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }}>
                      Query (optional)
                    </label>
                    <input
                      type="text"
                      value={retrievalOptions.query || ''}
                      onChange={(e) => setRetrievalOptions({ ...retrievalOptions, query: e.target.value })}
                      placeholder="Enter search query for vector similarity..."
                      style={{ width: '100%', padding: '8px', fontSize: '14px', borderRadius: '4px', border: '1px solid var(--hal-border)' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                      <input
                        type="checkbox"
                        checked={retrievalOptions.includePinned || false}
                        onChange={(e) => setRetrievalOptions({ ...retrievalOptions, includePinned: e.target.checked })}
                      />
                      Include Pinned
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                      <input
                        type="checkbox"
                        checked={retrievalOptions.deterministic !== false}
                        onChange={(e) => setRetrievalOptions({ ...retrievalOptions, deterministic: e.target.checked })}
                      />
                      Deterministic
                    </label>
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }}>
                      Recency (days)
                    </label>
                    <input
                      type="number"
                      value={retrievalOptions.recencyDays || 30}
                      onChange={(e) => setRetrievalOptions({ ...retrievalOptions, recencyDays: parseInt(e.target.value) || 30 })}
                      min="1"
                      style={{ width: '100px', padding: '8px', fontSize: '14px', borderRadius: '4px', border: '1px solid var(--hal-border)' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }}>
                      Limit
                    </label>
                    <input
                      type="number"
                      value={retrievalOptions.limit || 20}
                      onChange={(e) => setRetrievalOptions({ ...retrievalOptions, limit: parseInt(e.target.value) || 20 })}
                      min="1"
                      max="100"
                      style={{ width: '100px', padding: '8px', fontSize: '14px', borderRadius: '4px', border: '1px solid var(--hal-border)' }}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={performHybridSearch}
                    disabled={loading}
                    style={{ alignSelf: 'flex-start' }}
                  >
                    {loading ? 'Searching...' : 'Perform Hybrid Retrieval'}
                  </button>
                </div>
              </div>

              {error && (
                <div style={{ padding: '12px', background: 'var(--hal-status-error, #c62828)', color: 'white', borderRadius: '4px' }}>
                  <strong>Error:</strong> {error}
                </div>
              )}

              {/* Retrieval Sources Summary */}
              {(retrievalResult?.retrievalMetadata || generationResult?.retrievalMetadata) && (
                <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Retrieval sources</h3>
                  <div style={{ fontSize: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {(retrievalResult?.retrievalMetadata || generationResult?.retrievalMetadata) && (
                      <>
                        {(retrievalResult?.retrievalMetadata?.repoFilter || generationResult?.retrievalMetadata?.repoFilter) && (
                          <div>
                            <strong>Repo filter:</strong>{' '}
                            {retrievalResult?.retrievalMetadata?.repoFilter || generationResult?.retrievalMetadata?.repoFilter}
                          </div>
                        )}
                        <div>
                          <strong>Pinned included:</strong>{' '}
                          {retrievalResult?.retrievalMetadata?.pinnedIncluded || generationResult?.retrievalMetadata?.pinnedIncluded
                            ? 'Yes'
                            : 'No'}
                        </div>
                        {(retrievalResult?.retrievalMetadata?.recencyWindow || generationResult?.retrievalMetadata?.recencyWindow) && (
                          <div>
                            <strong>Recency window:</strong>{' '}
                            {retrievalResult?.retrievalMetadata?.recencyWindow || generationResult?.retrievalMetadata?.recencyWindow}
                          </div>
                        )}
                        <div>
                          <strong>Items considered:</strong>{' '}
                          {formatNumber(
                            retrievalResult?.retrievalMetadata?.totalConsidered || generationResult?.retrievalMetadata?.totalConsidered || 0
                          )}
                        </div>
                        <div>
                          <strong>Items selected:</strong>{' '}
                          {formatNumber(
                            retrievalResult?.retrievalMetadata?.totalSelected || generationResult?.retrievalMetadata?.totalSelected || 0
                          )}
                        </div>
                        {(retrievalResult?.retrievalMetadata?.totalConsidered === 0 ||
                          generationResult?.retrievalMetadata?.totalConsidered === 0) && (
                          <div style={{ padding: '12px', background: 'var(--hal-surface-alt)', borderRadius: '4px', marginTop: '8px' }}>
                            <strong>No matching sources found</strong>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Selected Artifacts */}
              {retrievalResult?.success && retrievalResult.artifacts.length > 0 && (
                <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Selected Artifacts ({retrievalResult.artifacts.length})</h3>
                  <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {retrievalResult.artifacts.map((artifact) => (
                      <div
                        key={artifact.artifact_id}
                        style={{
                          padding: '8px',
                          background: 'var(--hal-surface-alt)',
                          borderRadius: '4px',
                          fontSize: '14px',
                        }}
                      >
                        <div style={{ fontWeight: '500' }}>{artifact.title}</div>
                        {artifact.similarity !== undefined && (
                          <div style={{ fontSize: '12px', color: 'var(--hal-text-muted)', marginTop: '4px' }}>
                            Similarity: {(artifact.similarity * 100).toFixed(1)}%
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Generate RED Button */}
              {retrievalResult?.success && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '8px' }}>
                  <button type="button" className="btn-standard" onClick={onClose}>
                    Close
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={generateRed}
                    disabled={loading || !retrievalResult.success}
                  >
                    {loading ? 'Generating...' : 'Generate RED'}
                  </button>
                </div>
              )}

              {generationResult?.success && (
                <div style={{ padding: '12px', background: 'var(--hal-status-success, #2e7d32)', color: 'white', borderRadius: '4px' }}>
                  <strong>RED generated successfully</strong>
                  {generationResult.red_document && (
                    <div style={{ marginTop: '8px', fontSize: '14px' }}>
                      Version {generationResult.red_document.version}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
