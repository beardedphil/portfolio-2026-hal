import { useState, useEffect } from 'react'

interface ContextBundleModalProps {
  isOpen: boolean
  onClose: () => void
  ticketPk: string | null
  ticketId: string | null
  repoFullName: string | null
  supabaseUrl: string | null
  supabaseAnonKey: string | null
  // Allow ticket selection via input if not provided
  allowTicketSelection?: boolean
}

interface Artifact {
  artifact_id: string
  title: string
  agent_type: string
  created_at: string
  updated_at?: string
  body_md?: string
}

interface DistilledArtifact {
  summary: string
  hard_facts: string[]
  keywords: string[]
}

interface DistilledCard {
  artifact_id: string
  artifact_version: number
  title: string
  distilled: DistilledArtifact
  error?: string
}

interface Bundle {
  bundle_id: string
  ticket_id: string
  role: string
  version: number
  created_at: string
  created_by: string | null
}

interface BundleListResponse {
  success: boolean
  bundles?: Bundle[]
  error?: string
}

interface BundleReceipt {
  receipt_id: string
  bundle_id: string
  ticket_id: string
  role: string
  content_checksum: string
  bundle_checksum: string
  section_metrics: Record<string, number>
  total_characters: number
  red_reference: { red_id: string; version: number } | null
  integration_manifest_reference: {
    manifest_id: string
    version: number
    schema_version: string
  } | null
  git_ref: {
    pr_url?: string
    pr_number?: number
    base_sha?: string
    head_sha?: string
  } | null
  created_at: string
  bundle: {
    bundle_id: string
    ticket_id: string
    role: string
    version: number
    created_at: string
  } | null
}

interface ReceiptResponse {
  success: boolean
  receipt?: BundleReceipt
  error?: string
}

interface GenerateResponse {
  success: boolean
  bundle?: {
    bundle_id: string
    version: number
    role: string
    created_at: string
  }
  receipt?: {
    receipt_id: string
    content_checksum: string
    bundle_checksum: string
    section_metrics: Record<string, number>
    total_characters: number
  }
  error?: string
}

export function ContextBundleModal({
  isOpen,
  onClose,
  ticketPk: initialTicketPk,
  ticketId: initialTicketId,
  repoFullName: initialRepoFullName,
  supabaseUrl,
  supabaseAnonKey,
  allowTicketSelection = false,
}: ContextBundleModalProps) {
  const apiBaseUrl = import.meta.env.VITE_HAL_API_BASE_URL || window.location.origin
  const [bundles, setBundles] = useState<Bundle[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedBundleId, setSelectedBundleId] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<BundleReceipt | null>(null)
  const [receiptLoading, setReceiptLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generateRole, setGenerateRole] = useState<string>('implementation-agent')
  
  // Ticket selection state (if allowTicketSelection is true)
  const [selectedTicketId, setSelectedTicketId] = useState<string>(initialTicketId || '')
  const [selectedTicketPk, setSelectedTicketPk] = useState<string | null>(initialTicketPk)
  const [selectedRepoFullName, setSelectedRepoFullName] = useState<string | null>(initialRepoFullName)
  const [loadingTicket, setLoadingTicket] = useState(false)

  // Artifact selection and distillation state
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [loadingArtifacts, setLoadingArtifacts] = useState(false)
  const [selectedArtifactIds, setSelectedArtifactIds] = useState<Set<string>>(new Set())
  const [distilledCards, setDistilledCards] = useState<DistilledCard[]>([])
  const [distilling, setDistilling] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  // Load bundles and artifacts when modal opens
  useEffect(() => {
    if (isOpen && selectedTicketPk && supabaseUrl && supabaseAnonKey) {
      loadBundles()
      loadArtifacts()
    }
  }, [isOpen, selectedTicketPk, supabaseUrl, supabaseAnonKey])
  
  // Sync initial values when they change
  useEffect(() => {
    if (initialTicketId) setSelectedTicketId(initialTicketId)
    if (initialTicketPk) setSelectedTicketPk(initialTicketPk)
    if (initialRepoFullName) setSelectedRepoFullName(initialRepoFullName)
  }, [initialTicketId, initialTicketPk, initialRepoFullName])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setBundles([])
      setError(null)
      setSelectedBundleId(null)
      setReceipt(null)
      setGenerateRole('implementation-agent')
      setArtifacts([])
      setSelectedArtifactIds(new Set())
      setDistilledCards([])
      setShowPreview(false)
      if (!allowTicketSelection) {
        setSelectedTicketId(initialTicketId || '')
        setSelectedTicketPk(initialTicketPk)
        setSelectedRepoFullName(initialRepoFullName)
      }
    }
  }, [isOpen, allowTicketSelection, initialTicketId, initialTicketPk, initialRepoFullName])
  
  const loadTicketInfo = async (ticketId: string) => {
    if (!supabaseUrl || !supabaseAnonKey) return
    
    setLoadingTicket(true)
    setError(null)
    
    try {
      // Use the tickets API endpoint to get ticket info
      const response = await fetch(`${apiBaseUrl}/api/tickets/get`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          ticketId,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })
      
      const data = (await response.json()) as {
        success: boolean
        ticket?: {
          pk: string
          id: string
          repo_full_name: string
        }
        error?: string
      }
      
      if (!response.ok || !data.success || !data.ticket) {
        setError(data.error || `Ticket ${ticketId} not found`)
        return
      }
      
      setSelectedTicketPk(data.ticket.pk)
      setSelectedRepoFullName(data.ticket.repo_full_name)
      setSelectedTicketId(data.ticket.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoadingTicket(false)
    }
  }
  
  const handleTicketIdSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedTicketId.trim()) {
      await loadTicketInfo(selectedTicketId.trim())
    }
  }

  const loadBundles = async () => {
    if (!selectedTicketPk || !supabaseUrl || !supabaseAnonKey) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`${apiBaseUrl}/api/context-bundles/list`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          ticketPk: selectedTicketPk,
          ticketId: selectedTicketId,
          repoFullName: selectedRepoFullName,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const data = (await response.json()) as BundleListResponse

      if (!response.ok || !data.success) {
        setError(data.error || 'Failed to load bundles')
        return
      }

      setBundles(data.bundles || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const loadArtifacts = async () => {
    if (!selectedTicketPk || !supabaseUrl || !supabaseAnonKey) return

    setLoadingArtifacts(true)
    setError(null)

    try {
      const response = await fetch(`${apiBaseUrl}/api/artifacts/get`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          ticketPk: selectedTicketPk,
          ticketId: selectedTicketId,
          supabaseUrl,
          supabaseAnonKey,
          summary: true, // Get summary mode for faster loading
        }),
      })

      const data = (await response.json()) as {
        success: boolean
        artifacts?: Artifact[]
        error?: string
      }

      if (!response.ok || !data.success) {
        setError(data.error || 'Failed to load artifacts')
        return
      }

      setArtifacts(data.artifacts || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoadingArtifacts(false)
    }
  }

  const loadReceipt = async (bundleId: string) => {
    if (!supabaseUrl || !supabaseAnonKey) return

    setReceiptLoading(true)
    setError(null)

    try {
      const response = await fetch(`${apiBaseUrl}/api/context-bundles/get-receipt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          bundleId,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const data = (await response.json()) as ReceiptResponse

      if (!response.ok || !data.success) {
        setError(data.error || 'Failed to load receipt')
        return
      }

      setReceipt(data.receipt || null)
      setSelectedBundleId(bundleId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setReceiptLoading(false)
    }
  }

  const handleArtifactToggle = (artifactId: string) => {
    const newSelected = new Set(selectedArtifactIds)
    if (newSelected.has(artifactId)) {
      newSelected.delete(artifactId)
    } else {
      newSelected.add(artifactId)
    }
    setSelectedArtifactIds(newSelected)
    // Clear preview when selection changes
    setDistilledCards([])
    setShowPreview(false)
  }

  const handlePreviewBundle = async () => {
    if (selectedArtifactIds.size === 0) {
      setError('Please select at least one artifact')
      return
    }

    if (!supabaseUrl || !supabaseAnonKey) return

    setDistilling(true)
    setError(null)
    setShowPreview(true)

    try {
      const artifactIdsArray = Array.from(selectedArtifactIds)

      const response = await fetch(`${apiBaseUrl}/api/context-bundles/distill-artifact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          artifactIds: artifactIdsArray,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const data = (await response.json()) as {
        success: boolean
        results?: Array<{
          artifact_id: string
          success: boolean
          distilled?: DistilledArtifact
          error?: string
        }>
        error?: string
      }

      if (!response.ok || !data.success) {
        setError(data.error || 'Failed to distill artifacts')
        return
      }

      // Build distilled cards with artifact metadata
      const cards: DistilledCard[] = []
      const artifactMap = new Map(artifacts.map((a) => [a.artifact_id, a]))

      for (const result of data.results || []) {
        const artifact = artifactMap.get(result.artifact_id)
        if (!artifact) continue

        if (result.success && result.distilled) {
          cards.push({
            artifact_id: result.artifact_id,
            artifact_version: 1, // TODO: Get actual version from artifact metadata
            title: artifact.title,
            distilled: result.distilled,
          })
        } else {
          cards.push({
            artifact_id: result.artifact_id,
            artifact_version: 1,
            title: artifact.title,
            distilled: {
              summary: '',
              hard_facts: [],
              keywords: [],
            },
            error: result.error || 'Distillation failed',
          })
        }
      }

      setDistilledCards(cards)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setShowPreview(false)
    } finally {
      setDistilling(false)
    }
  }

  const handleGenerate = async () => {
    if (!selectedTicketPk || !selectedRepoFullName || !supabaseUrl || !supabaseAnonKey) {
      setError('Missing required information to generate bundle')
      return
    }

    if (selectedArtifactIds.size === 0) {
      setError('Please select at least one artifact to include in the bundle')
      return
    }

    // Check if there are any distillation errors
    const hasErrors = distilledCards.some((card) => card.error)
    if (hasErrors) {
      setError('Cannot generate bundle: some artifacts failed distillation. Please fix errors or remove failed artifacts.')
      return
    }

    // If preview hasn't been generated, generate it first
    if (distilledCards.length === 0) {
      await handlePreviewBundle()
      // Wait a bit for state to update
      await new Promise((resolve) => setTimeout(resolve, 500))
      // Check again after preview
      const stillHasErrors = distilledCards.some((card) => card.error)
      if (stillHasErrors) {
        setError('Cannot generate bundle: some artifacts failed distillation. Please fix errors or remove failed artifacts.')
        return
      }
    }

    setGenerating(true)
    setError(null)

    try {
      // Build bundle JSON with distilled artifacts
      const distilledArtifacts = distilledCards
        .filter((card) => !card.error)
        .map((card) => ({
          artifact_id: card.artifact_id,
          artifact_version: card.artifact_version,
          title: card.title,
          distilled: card.distilled,
        }))

      const bundleJson = {
        ticket: `Ticket ${selectedTicketId || selectedTicketPk}`,
        repo_context: `Repository: ${selectedRepoFullName}`,
        role: generateRole,
        generated_at: new Date().toISOString(),
        artifacts: distilledArtifacts,
      }

      const response = await fetch(`${apiBaseUrl}/api/context-bundles/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          ticketPk: selectedTicketPk,
          ticketId: selectedTicketId,
          repoFullName: selectedRepoFullName,
          role: generateRole,
          bundleJson,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const data = (await response.json()) as GenerateResponse

      if (!response.ok || !data.success) {
        setError(data.error || 'Failed to generate bundle')
        return
      }

      // Reload bundles to show the new one
      await loadBundles()

      // If a bundle was created, show its receipt
      if (data.bundle?.bundle_id) {
        await loadReceipt(data.bundle.bundle_id)
      }

      // Reset preview state
      setShowPreview(false)
      setDistilledCards([])
      setSelectedArtifactIds(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setGenerating(false)
    }
  }

  const formatRole = (role: string): string => {
    return role
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  const formatTimestamp = (timestamp: string): string => {
    return new Date(timestamp).toLocaleString()
  }

  if (!isOpen) return null

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Context Bundles</h2>
            <button type="button" className="modal-close" onClick={onClose}>
              ×
            </button>
          </div>
          <div className="modal-body">
            <p>Supabase connection required to view context bundles.</p>
          </div>
        </div>
      </div>
    )
  }
  
  const needsTicketSelection = !selectedTicketPk && allowTicketSelection

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '900px', maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Context Bundles {selectedTicketId ? `- ${selectedTicketId}` : ''}</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'auto' }}>
          {error && (
            <div style={{ padding: '12px', background: 'var(--hal-status-error, #c62828)', color: 'white', borderRadius: '4px' }}>
              {error}
            </div>
          )}

          {/* Ticket Selection (if allowTicketSelection is true) */}
          {needsTicketSelection && (
            <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '18px' }}>Select Ticket</h3>
              <form onSubmit={handleTicketIdSubmit} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <label>
                  Ticket ID:
                  <input
                    type="text"
                    value={selectedTicketId}
                    onChange={(e) => setSelectedTicketId(e.target.value)}
                    placeholder="e.g., HAL-0761"
                    style={{ marginLeft: '8px', padding: '4px 8px', minWidth: '150px' }}
                  />
                </label>
                <button type="submit" className="btn-standard" disabled={loadingTicket || !selectedTicketId.trim()}>
                  {loadingTicket ? 'Loading...' : 'Load'}
                </button>
              </form>
            </div>
          )}

          {!needsTicketSelection && selectedTicketPk && (
            <>
              {/* Artifact Selection Section */}
              <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '18px' }}>Select Artifacts for Bundle</h3>
                {loadingArtifacts ? (
                  <p>Loading artifacts...</p>
                ) : artifacts.length === 0 ? (
                  <p style={{ color: 'var(--hal-text-muted)' }}>No artifacts found for this ticket.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                    {artifacts.map((artifact) => (
                      <label
                        key={artifact.artifact_id}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '8px',
                          padding: '8px',
                          border: '1px solid var(--hal-border)',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          background: selectedArtifactIds.has(artifact.artifact_id) ? 'var(--hal-surface-alt)' : 'transparent',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedArtifactIds.has(artifact.artifact_id)}
                          onChange={() => handleArtifactToggle(artifact.artifact_id)}
                          style={{ marginTop: '2px' }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '600', marginBottom: '4px' }}>{artifact.title}</div>
                          <div style={{ fontSize: '12px', color: 'var(--hal-text-muted)' }}>
                            {artifact.agent_type} • {new Date(artifact.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: '12px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <label>
                    Role:
                    <select
                      value={generateRole}
                      onChange={(e) => setGenerateRole(e.target.value)}
                      style={{ marginLeft: '8px', padding: '4px 8px' }}
                    >
                      <option value="implementation-agent">Implementation Agent</option>
                      <option value="qa-agent">QA Agent</option>
                      <option value="project-manager">Project Manager</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className="btn-standard"
                    onClick={handlePreviewBundle}
                    disabled={distilling || selectedArtifactIds.size === 0}
                  >
                    {distilling ? 'Distilling...' : 'Preview Bundle'}
                  </button>
                  <button
                    type="button"
                    className="btn-standard"
                    onClick={handleGenerate}
                    disabled={generating || selectedArtifactIds.size === 0 || distilledCards.some((c) => c.error)}
                    style={{ marginLeft: 'auto' }}
                  >
                    {generating ? 'Generating...' : 'Generate Bundle'}
                  </button>
                </div>
              </div>

              {/* Bundle Preview (Distilled Cards) */}
              {showPreview && (
                <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '18px' }}>Bundle Preview</h3>
                  {distilling ? (
                    <p>Distilling artifacts...</p>
                  ) : distilledCards.length === 0 ? (
                    <p style={{ color: 'var(--hal-text-muted)' }}>No artifacts selected or preview not generated.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {distilledCards.map((card) => (
                        <div
                          key={card.artifact_id}
                          style={{
                            border: '1px solid var(--hal-border)',
                            borderRadius: '4px',
                            padding: '12px',
                            background: card.error ? 'var(--hal-status-error-light, #ffebee)' : 'var(--hal-surface)',
                          }}
                        >
                          {card.error ? (
                            <div>
                              <div style={{ fontWeight: '600', color: 'var(--hal-status-error, #c62828)', marginBottom: '8px' }}>
                                Error: {card.title}
                              </div>
                              <div style={{ fontSize: '14px', color: 'var(--hal-status-error, #c62828)' }}>
                                {card.error}
                              </div>
                              <div style={{ fontSize: '12px', color: 'var(--hal-text-muted)', marginTop: '8px' }}>
                                Artifact ID: {card.artifact_id} • Version: {card.artifact_version}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <div style={{ fontWeight: '600' }}>{card.title}</div>
                                <div style={{ fontSize: '12px', color: 'var(--hal-text-muted)' }}>
                                  ID: {card.artifact_id.substring(0, 8)}... • v{card.artifact_version}
                                </div>
                              </div>
                              <div style={{ marginBottom: '8px' }}>
                                <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Summary</div>
                                <div style={{ fontSize: '14px', color: 'var(--hal-text)' }}>{card.distilled.summary}</div>
                              </div>
                              {card.distilled.hard_facts.length > 0 && (
                                <div style={{ marginBottom: '8px' }}>
                                  <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Hard Facts</div>
                                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px' }}>
                                    {card.distilled.hard_facts.map((fact, idx) => (
                                      <li key={idx} style={{ marginBottom: '4px' }}>
                                        {fact}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {card.distilled.keywords.length > 0 && (
                                <div>
                                  <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Keywords</div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                    {card.distilled.keywords.map((keyword, idx) => (
                                      <span
                                        key={idx}
                                        style={{
                                          padding: '2px 8px',
                                          background: 'var(--hal-surface-alt)',
                                          borderRadius: '12px',
                                          fontSize: '12px',
                                        }}
                                      >
                                        {keyword}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

          {/* Bundle List */}
          <div>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '18px' }}>Bundles</h3>
            {loading ? (
              <p>Loading bundles...</p>
            ) : bundles.length === 0 ? (
              <p style={{ color: 'var(--hal-text-muted)' }}>No bundles generated yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {bundles.map((bundle) => (
                  <div
                    key={bundle.bundle_id}
                    style={{
                      border: '1px solid var(--hal-border)',
                      borderRadius: '4px',
                      padding: '12px',
                      cursor: 'pointer',
                      background: selectedBundleId === bundle.bundle_id ? 'var(--hal-surface-alt)' : 'var(--hal-surface)',
                    }}
                    onClick={() => loadReceipt(bundle.bundle_id)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                          {formatRole(bundle.role)} - Version {bundle.version}
                        </div>
                        <div style={{ fontSize: '14px', color: 'var(--hal-text-muted)' }}>
                          {formatTimestamp(bundle.created_at)}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn-standard"
                        onClick={(e) => {
                          e.stopPropagation()
                          loadReceipt(bundle.bundle_id)
                        }}
                      >
                        View Receipt
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Receipt View */}
          {selectedBundleId && (
            <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '18px' }}>Bundle Receipt</h3>
              {receiptLoading ? (
                <p>Loading receipt...</p>
              ) : receipt ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Checksums */}
                  <div>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>Checksums</h4>
                    <div style={{ fontFamily: 'monospace', fontSize: '12px', background: 'var(--hal-surface-alt)', padding: '8px', borderRadius: '4px' }}>
                      <div style={{ marginBottom: '4px' }}>
                        <strong>Content Checksum:</strong> {receipt.content_checksum}
                      </div>
                      <div>
                        <strong>Bundle Checksum:</strong> {receipt.bundle_checksum}
                      </div>
                    </div>
                  </div>

                  {/* Section Metrics */}
                  <div>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>Character Breakdown</h4>
                    <div style={{ background: 'var(--hal-surface-alt)', padding: '8px', borderRadius: '4px' }}>
                      {Object.entries(receipt.section_metrics).map(([section, count]) => (
                        <div key={section} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span>{section}:</span>
                          <span style={{ fontFamily: 'monospace' }}>{count.toLocaleString()} chars</span>
                        </div>
                      ))}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginTop: '8px',
                          paddingTop: '8px',
                          borderTop: '1px solid var(--hal-border)',
                          fontWeight: '600',
                        }}
                      >
                        <span>Total:</span>
                        <span style={{ fontFamily: 'monospace' }}>{receipt.total_characters.toLocaleString()} chars</span>
                      </div>
                    </div>
                  </div>

                  {/* References */}
                  <div>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>References</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {receipt.red_reference && (
                        <div style={{ fontSize: '14px' }}>
                          <strong>RED:</strong> Version {receipt.red_reference.version} (ID: {receipt.red_reference.red_id.substring(0, 8)}...)
                        </div>
                      )}
                      {receipt.integration_manifest_reference && (
                        <div style={{ fontSize: '14px' }}>
                          <strong>Integration Manifest:</strong> Version {receipt.integration_manifest_reference.version} (Schema: {receipt.integration_manifest_reference.schema_version}, ID: {receipt.integration_manifest_reference.manifest_id.substring(0, 8)}...)
                        </div>
                      )}
                      {receipt.git_ref && (
                        <div style={{ fontSize: '14px' }}>
                          <strong>Git Ref:</strong>{' '}
                          {receipt.git_ref.pr_url ? (
                            <a href={receipt.git_ref.pr_url} target="_blank" rel="noopener noreferrer">
                              PR #{receipt.git_ref.pr_number}
                            </a>
                          ) : (
                            'N/A'
                          )}
                          {receipt.git_ref.base_sha && (
                            <span style={{ marginLeft: '8px', fontFamily: 'monospace', fontSize: '12px' }}>
                              Base: {receipt.git_ref.base_sha.substring(0, 7)}...
                            </span>
                          )}
                          {receipt.git_ref.head_sha && (
                            <span style={{ marginLeft: '8px', fontFamily: 'monospace', fontSize: '12px' }}>
                              Head: {receipt.git_ref.head_sha.substring(0, 7)}...
                            </span>
                          )}
                        </div>
                      )}
                      {!receipt.red_reference && !receipt.integration_manifest_reference && !receipt.git_ref && (
                        <div style={{ fontSize: '14px', color: 'var(--hal-text-muted)' }}>No references</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <p style={{ color: 'var(--hal-text-muted)' }}>Receipt not found.</p>
              )}
            </div>
          )}
            </>
          )}

          {!selectedTicketPk && !needsTicketSelection && (
            <p style={{ color: 'var(--hal-text-muted)' }}>No ticket selected. Please provide a ticket ID.</p>
          )}
        </div>
      </div>
    </div>
  )
}
