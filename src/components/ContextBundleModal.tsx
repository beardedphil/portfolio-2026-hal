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
  budget?: {
    characterCount: number
    hardLimit: number
    role: string
    displayName: string
  } | null
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
  budget?: {
    characterCount: number
    hardLimit: number
    role: string
    displayName: string
  }
  budgetExceeded?: boolean
  characterCount?: number
  hardLimit?: number
  overage?: number
  distillation_errors?: Array<{ artifact_id: string; error: string }>
  error?: string
}

interface PreviewResponse {
  success: boolean
  budget?: {
    characterCount: number
    hardLimit: number
    role: string
    displayName: string
    exceeds: boolean
    overage: number
  }
  sectionMetrics?: Record<string, number>
  error?: string
}

interface Artifact {
  artifact_id: string
  title: string
  agent_type: string
  created_at: string
}

interface ArtifactsResponse {
  success: boolean
  artifacts?: Artifact[]
  error?: string
}

interface DistilledArtifact {
  artifact_id: string
  artifact_title: string
  summary: string
  hard_facts: string[]
  keywords: string[]
  distillation_error?: string
}

interface BundleJson {
  distilled_artifacts?: DistilledArtifact[]
  distillation_errors?: Array<{ artifact_id: string; error: string }>
  [key: string]: unknown
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
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [loadingArtifacts, setLoadingArtifacts] = useState(false)
  const [selectedArtifactIds, setSelectedArtifactIds] = useState<Set<string>>(new Set())
  const [bundleJson, setBundleJson] = useState<BundleJson | null>(null)
  const [previewBudget, setPreviewBudget] = useState<PreviewResponse['budget'] | null>(null)
  const [previewSectionMetrics, setPreviewSectionMetrics] = useState<Record<string, number> | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  
  // Ticket selection state (if allowTicketSelection is true)
  const [selectedTicketId, setSelectedTicketId] = useState<string>(initialTicketId || '')
  const [selectedTicketPk, setSelectedTicketPk] = useState<string | null>(initialTicketPk)
  const [selectedRepoFullName, setSelectedRepoFullName] = useState<string | null>(initialRepoFullName)
  const [loadingTicket, setLoadingTicket] = useState(false)

  // Load bundles and artifacts when modal opens
  useEffect(() => {
    if (isOpen && selectedTicketPk && supabaseUrl && supabaseAnonKey) {
      loadBundles()
      loadArtifacts()
    }
  }, [isOpen, selectedTicketPk, supabaseUrl, supabaseAnonKey])

  // Preview budget when role or artifacts change
  useEffect(() => {
    if (isOpen && selectedTicketPk && selectedRepoFullName && supabaseUrl && supabaseAnonKey && selectedArtifactIds.size > 0) {
      previewBundleBudget()
    } else {
      setPreviewBudget(null)
      setPreviewSectionMetrics(null)
    }
  }, [isOpen, selectedTicketPk, selectedRepoFullName, generateRole, selectedArtifactIds, supabaseUrl, supabaseAnonKey])
  
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
      setBundleJson(null)
      setPreviewBudget(null)
      setPreviewSectionMetrics(null)
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
        }),
      })

      const data = (await response.json()) as ArtifactsResponse

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

      // Also fetch the bundle JSON to get distilled artifacts
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(supabaseUrl, supabaseAnonKey)
      const { data: bundleData, error: bundleError } = await supabase
        .from('context_bundles')
        .select('bundle_json')
        .eq('bundle_id', bundleId)
        .maybeSingle()

      if (!bundleError && bundleData) {
        setBundleJson(bundleData.bundle_json as BundleJson)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setReceiptLoading(false)
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

    setGenerating(true)
    setError(null)

    try {
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
          selectedArtifactIds: Array.from(selectedArtifactIds),
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const data = (await response.json()) as GenerateResponse

      if (!response.ok || !data.success) {
        // Check if this is a budget exceeded error
        if (data.budgetExceeded && data.budget) {
          const overage = data.overage || 0
          const sectionBreakdown = data.sectionMetrics 
            ? Object.entries(data.sectionMetrics)
                .map(([section, count]) => `  ${section}: ${count.toLocaleString()} chars`)
                .join('\n')
            : 'N/A'
          setError(
            `Bundle exceeds character budget for ${data.budget.displayName}:\n` +
            `  Current: ${data.characterCount?.toLocaleString() || 'N/A'} chars\n` +
            `  Limit: ${data.hardLimit?.toLocaleString() || 'N/A'} chars\n` +
            `  Overage: ${overage.toLocaleString()} chars\n\n` +
            `Per-section breakdown:\n${sectionBreakdown}\n\n` +
            `Please reduce the bundle size by:\n` +
            `  - Selecting fewer artifacts\n` +
            `  - Reducing artifact content\n` +
            `  - Using a different role with a higher limit`
          )
        } else if (data.distillation_errors && data.distillation_errors.length > 0) {
          // Check if this is a distillation error
          const errorMessages = data.distillation_errors.map((e) => {
            const artifact = artifacts.find((a) => a.artifact_id === e.artifact_id)
            return `${artifact?.title || e.artifact_id}: ${e.error}`
          }).join('\n')
          setError(`Bundle generation blocked: Some artifacts failed to distill. Please resolve these errors:\n${errorMessages}`)
        } else {
          setError(data.error || 'Failed to generate bundle')
        }
        return
      }

      // Reload bundles to show the new one
      await loadBundles()

      // If a bundle was created, show its receipt
      if (data.bundle?.bundle_id) {
        await loadReceipt(data.bundle.bundle_id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setGenerating(false)
    }
  }

  const previewBundleBudget = async () => {
    if (!selectedTicketPk || !selectedRepoFullName || !supabaseUrl || !supabaseAnonKey || selectedArtifactIds.size === 0) {
      return
    }

    setPreviewLoading(true)
    setError(null)

    try {
      const response = await fetch(`${apiBaseUrl}/api/context-bundles/preview`, {
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
          selectedArtifactIds: Array.from(selectedArtifactIds),
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const data = (await response.json()) as PreviewResponse

      if (!response.ok || !data.success) {
        // Don't set error for preview failures - just clear preview
        setPreviewBudget(null)
        setPreviewSectionMetrics(null)
        return
      }

      setPreviewBudget(data.budget || null)
      setPreviewSectionMetrics(data.sectionMetrics || null)
    } catch (err) {
      // Don't set error for preview failures - just clear preview
      setPreviewBudget(null)
      setPreviewSectionMetrics(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  const toggleArtifactSelection = (artifactId: string) => {
    const newSelection = new Set(selectedArtifactIds)
    if (newSelection.has(artifactId)) {
      newSelection.delete(artifactId)
    } else {
      newSelection.add(artifactId)
    }
    setSelectedArtifactIds(newSelection)
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
              {/* Generate Bundle Section */}
          <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '18px' }}>Generate New Bundle</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
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
                  onClick={handleGenerate}
                  disabled={generating || selectedArtifactIds.size === 0 || (previewBudget?.exceeds ?? false)}
                  style={{ marginLeft: 'auto' }}
                  title={previewBudget?.exceeds ? 'Bundle exceeds character budget. Please reduce bundle size before generating.' : undefined}
                >
                  {generating ? 'Generating...' : 'Generate Bundle'}
                </button>
              </div>

              {/* Budget Preview */}
              {previewBudget && (
                <div style={{ 
                  border: `2px solid ${previewBudget.exceeds ? 'var(--hal-status-error, #c62828)' : 'var(--hal-border)'}`, 
                  borderRadius: '8px', 
                  padding: '16px',
                  background: previewBudget.exceeds ? 'var(--hal-status-error-bg, #ffebee)' : 'var(--hal-surface-alt)',
                }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '16px', color: previewBudget.exceeds ? 'var(--hal-status-error, #c62828)' : 'inherit' }}>
                    Character Budget: {previewBudget.displayName}
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Total Characters:</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: '600' }}>
                        {previewBudget.characterCount.toLocaleString()} / {previewBudget.hardLimit.toLocaleString()}
                      </span>
                    </div>
                    {previewBudget.exceeds && (
                      <div style={{ 
                        padding: '8px', 
                        background: 'var(--hal-surface)', 
                        borderRadius: '4px',
                        color: 'var(--hal-status-error, #c62828)',
                        fontWeight: '600',
                      }}>
                        ⚠️ Exceeds limit by {previewBudget.overage.toLocaleString()} characters
                      </div>
                    )}
                    {previewSectionMetrics && (
                      <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--hal-border)' }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>Per-Section Breakdown:</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                          {Object.entries(previewSectionMetrics).map(([section, count]) => (
                            <div key={section} style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>{section}:</span>
                              <span style={{ fontFamily: 'monospace' }}>{count.toLocaleString()} chars</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Artifact Selection */}
              <div>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>Select Artifacts to Distill</h4>
                {loadingArtifacts ? (
                  <p>Loading artifacts...</p>
                ) : artifacts.length === 0 ? (
                  <p style={{ color: 'var(--hal-text-muted)', fontSize: '14px' }}>No artifacts found for this ticket.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                    {artifacts.map((artifact) => (
                      <label
                        key={artifact.artifact_id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px',
                          border: '1px solid var(--hal-border)',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          background: selectedArtifactIds.has(artifact.artifact_id) ? 'var(--hal-surface-alt)' : 'var(--hal-surface)',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedArtifactIds.has(artifact.artifact_id)}
                          onChange={() => toggleArtifactSelection(artifact.artifact_id)}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '500', fontSize: '14px' }}>{artifact.title}</div>
                          <div style={{ fontSize: '12px', color: 'var(--hal-text-muted)' }}>
                            {artifact.agent_type} • {new Date(artifact.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
                {selectedArtifactIds.size > 0 && (
                  <p style={{ marginTop: '8px', fontSize: '14px', color: 'var(--hal-text-muted)' }}>
                    {selectedArtifactIds.size} artifact{selectedArtifactIds.size !== 1 ? 's' : ''} selected
                  </p>
                )}
              </div>
            </div>
          </div>

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

                  {/* Budget Information */}
                  {receipt.budget && (
                    <div>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>Character Budget</h4>
                      <div style={{ background: 'var(--hal-surface-alt)', padding: '8px', borderRadius: '4px', fontSize: '14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span>Role:</span>
                          <span style={{ fontWeight: '600' }}>{receipt.budget.displayName}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span>Character Count:</span>
                          <span style={{ fontFamily: 'monospace' }}>{receipt.budget.characterCount.toLocaleString()} / {receipt.budget.hardLimit.toLocaleString()}</span>
                        </div>
                        {receipt.budget.characterCount > receipt.budget.hardLimit && (
                          <div style={{ 
                            marginTop: '8px', 
                            padding: '8px', 
                            background: 'var(--hal-status-error-bg, #ffebee)', 
                            borderRadius: '4px',
                            color: 'var(--hal-status-error, #c62828)',
                            fontWeight: '600',
                          }}>
                            ⚠️ Exceeds limit by {(receipt.budget.characterCount - receipt.budget.hardLimit).toLocaleString()} characters
                          </div>
                        )}
                      </div>
                    </div>
                  )}

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

                  {/* Distilled Artifacts */}
                  {bundleJson?.distilled_artifacts && bundleJson.distilled_artifacts.length > 0 && (
                    <div>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>Distilled Artifacts</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {bundleJson.distilled_artifacts.map((distilled) => (
                          <div
                            key={distilled.artifact_id}
                            style={{
                              border: '1px solid var(--hal-border)',
                              borderRadius: '8px',
                              padding: '12px',
                              background: distilled.distillation_error ? 'var(--hal-status-error-bg, #ffebee)' : 'var(--hal-surface-alt)',
                            }}
                          >
                            <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                <div style={{ fontWeight: '600', fontSize: '14px' }}>{distilled.artifact_title}</div>
                                <div style={{ fontSize: '12px', color: 'var(--hal-text-muted)', marginTop: '2px' }}>
                                  Artifact ID: {distilled.artifact_id.substring(0, 8)}... • Version: {receipt?.bundle?.version || 'N/A'}
                                </div>
                              </div>
                              {distilled.distillation_error && (
                                <div style={{ fontSize: '12px', color: 'var(--hal-status-error, #c62828)', fontWeight: '600' }}>
                                  Distillation Failed
                                </div>
                              )}
                            </div>
                            {distilled.distillation_error ? (
                              <div style={{ padding: '8px', background: 'var(--hal-surface)', borderRadius: '4px', fontSize: '14px', color: 'var(--hal-status-error, #c62828)' }}>
                                <strong>Error:</strong> {distilled.distillation_error}
                              </div>
                            ) : (
                              <>
                                <div style={{ marginBottom: '8px' }}>
                                  <div style={{ fontWeight: '600', fontSize: '13px', marginBottom: '4px' }}>Summary</div>
                                  <div style={{ fontSize: '14px', lineHeight: '1.5' }}>{distilled.summary || 'No summary available'}</div>
                                </div>
                                {distilled.hard_facts.length > 0 && (
                                  <div style={{ marginBottom: '8px' }}>
                                    <div style={{ fontWeight: '600', fontSize: '13px', marginBottom: '4px' }}>Hard Facts</div>
                                    <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', lineHeight: '1.5' }}>
                                      {distilled.hard_facts.map((fact, idx) => (
                                        <li key={idx}>{fact}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                {distilled.keywords.length > 0 && (
                                  <div>
                                    <div style={{ fontWeight: '600', fontSize: '13px', marginBottom: '4px' }}>Keywords</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                      {distilled.keywords.map((keyword, idx) => (
                                        <span
                                          key={idx}
                                          style={{
                                            padding: '2px 8px',
                                            background: 'var(--hal-surface)',
                                            borderRadius: '4px',
                                            fontSize: '12px',
                                            border: '1px solid var(--hal-border)',
                                          }}
                                        >
                                          {keyword}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

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
