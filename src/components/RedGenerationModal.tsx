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

interface RedGenerationResult {
  success: boolean
  red_document?: {
    red_id: string
    version: number
    ticket_pk: string
    repo_full_name: string
  }
  retrievalMetadata?: {
    repoFilter: string
    recencyWindow: string | null
    pinnedIncluded: boolean
    itemsConsidered: number
    itemsSelected: number
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
  const [useHybridRetrieval, setUseHybridRetrieval] = useState(true)
  const [retrievalQuery, setRetrievalQuery] = useState('')
  const [recencyDays, setRecencyDays] = useState<number | null>(30)
  const [includePinned, setIncludePinned] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<RedGenerationResult | null>(null)
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
      setResult(null)
      setError(null)
      // Set default query from ticket ID if available
      if (initialTicketId && !retrievalQuery) {
        setRetrievalQuery(`Ticket ${initialTicketId} requirements and implementation details`)
      }
    }
  }, [isOpen, initialTicketPk, initialTicketId, initialRepoFullName])

  const handleGenerate = async () => {
    if (!repoFullName || !ticketPk && !ticketId || !supabaseUrl || !supabaseAnonKey) {
      setError('Missing required fields: repository, ticket, or Supabase credentials')
      return
    }

    if (useHybridRetrieval && !retrievalQuery) {
      setError('Query is required when using hybrid retrieval')
      return
    }

    setGenerating(true)
    setError(null)
    setResult(null)

    try {
      const apiBaseUrl = apiBaseUrlRef.current || window.location.origin
      const requestBody: any = {
        ticketPk: ticketPk || undefined,
        ticketId: ticketId || undefined,
        repoFullName,
        supabaseUrl,
        supabaseAnonKey,
      }

      // Add hybrid retrieval options if enabled
      if (useHybridRetrieval && retrievalQuery) {
        requestBody.useHybridRetrieval = true
        requestBody.retrievalQuery = retrievalQuery
        requestBody.recencyDays = recencyDays
        requestBody.includePinned = includePinned
        // OpenAI API key is handled server-side from environment variable
      }

      const response = await fetch(`${apiBaseUrl}/api/red/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      const data = (await response.json()) as RedGenerationResult

      if (!data.success) {
        throw new Error(data.error || 'Failed to generate RED')
      }

      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate RED')
    } finally {
      setGenerating(false)
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
                <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Retrieval Options</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={useHybridRetrieval}
                      onChange={(e) => setUseHybridRetrieval(e.target.checked)}
                    />
                    <span>Use hybrid retrieval (vector similarity + metadata filters)</span>
                  </label>
                  {useHybridRetrieval && (
                    <>
                      <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>
                          Query (for vector similarity search):
                        </label>
                        <input
                          type="text"
                          value={retrievalQuery}
                          onChange={(e) => setRetrievalQuery(e.target.value)}
                          placeholder="Enter query to find relevant artifacts..."
                          style={{
                            width: '100%',
                            padding: '8px',
                            fontSize: '14px',
                            border: '1px solid var(--hal-border)',
                            borderRadius: '4px',
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>
                          Recency window (days, leave empty for no filter):
                        </label>
                        <input
                          type="number"
                          value={recencyDays ?? ''}
                          onChange={(e) => {
                            const val = e.target.value
                            setRecencyDays(val === '' ? null : parseInt(val, 10))
                          }}
                          placeholder="30"
                          min="1"
                          style={{
                            width: '100%',
                            padding: '8px',
                            fontSize: '14px',
                            border: '1px solid var(--hal-border)',
                            borderRadius: '4px',
                          }}
                        />
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={includePinned}
                          onChange={(e) => setIncludePinned(e.target.checked)}
                        />
                        <span>Include pinned artifacts</span>
                      </label>
                    </>
                  )}
                </div>
              </div>

              {/* Generate Button */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleGenerate}
                  disabled={generating || (useHybridRetrieval && !retrievalQuery)}
                  style={{
                    opacity: generating || (useHybridRetrieval && !retrievalQuery) ? 0.5 : 1,
                    cursor: generating || (useHybridRetrieval && !retrievalQuery) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {generating ? 'Generating...' : 'Generate RED'}
                </button>
              </div>

              {/* Retrieval Sources Summary */}
              {result?.retrievalMetadata && (
                <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px', background: 'var(--hal-surface-alt)' }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Retrieval Sources</h3>
                  {result.retrievalMetadata.itemsConsidered === 0 ? (
                    <div style={{ padding: '12px', background: 'var(--hal-status-error, #c62828)', color: 'white', borderRadius: '4px' }}>
                      <strong>No matching sources found</strong>
                      <p style={{ margin: '8px 0 0 0', fontSize: '14px' }}>
                        No artifacts matched the specified filters (repo: {result.retrievalMetadata.repoFilter}
                        {result.retrievalMetadata.recencyWindow ? `, ${result.retrievalMetadata.recencyWindow}` : ''}
                        {result.retrievalMetadata.pinnedIncluded ? ', pinned only' : ''}).
                      </p>
                    </div>
                  ) : (
                    <div style={{ fontSize: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div>
                        <strong>Repo filter:</strong> {result.retrievalMetadata.repoFilter}
                      </div>
                      <div>
                        <strong>Pinned included:</strong> {result.retrievalMetadata.pinnedIncluded ? 'Yes' : 'No'}
                      </div>
                      <div>
                        <strong>Recency window:</strong> {result.retrievalMetadata.recencyWindow || 'No filter'}
                      </div>
                      <div>
                        <strong>Items considered:</strong> {formatNumber(result.retrievalMetadata.itemsConsidered)}
                      </div>
                      <div>
                        <strong>Items selected:</strong> {formatNumber(result.retrievalMetadata.itemsSelected)}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Success Message */}
              {result?.success && result.red_document && (
                <div style={{ padding: '16px', background: 'var(--hal-status-success, #2e7d32)', color: 'white', borderRadius: '8px' }}>
                  <strong>✓ RED Generated Successfully</strong>
                  <p style={{ margin: '8px 0 0 0', fontSize: '14px' }}>
                    RED document version {result.red_document.version} created for ticket {ticketId || ticketPk}.
                  </p>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div style={{ padding: '12px', background: 'var(--hal-status-error, #c62828)', color: 'white', borderRadius: '4px' }}>
                  <strong>Error:</strong> {error}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
