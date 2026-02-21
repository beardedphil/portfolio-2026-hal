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
  bundle?: BundleJson // Full bundle content for preview
  error?: string
}

interface BundleJson {
  meta?: {
    project_id?: string
    ticket_id?: string
    role?: string
    bundle_id?: string
    created_at?: string
  }
  project_manifest?: unknown
  ticket?: unknown
  state_snapshot?: unknown
  recent_deltas?: unknown
  repo_context?: unknown
  relevant_artifacts?: unknown
  instructions?: unknown
  [key: string]: unknown
}

// Role mapping for UI display
const ROLE_OPTIONS = [
  { value: 'project-manager', label: 'PM' },
  { value: 'implementation-agent', label: 'Dev' },
  { value: 'qa-agent', label: 'QA' },
  { value: 'process-review', label: 'Process Review' },
]

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
  
  // Core state
  const [bundles, setBundles] = useState<Bundle[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Selected bundle and receipt
  const [selectedBundleId, setSelectedBundleId] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<BundleReceipt | null>(null)
  const [receiptLoading, setReceiptLoading] = useState(false)
  const [bundleJson, setBundleJson] = useState<BundleJson | null>(null)
  const [receiptExpanded, setReceiptExpanded] = useState(false)
  
  // Role selection for preview
  const [previewRole, setPreviewRole] = useState<string>('implementation-agent')
  const [previewBudget, setPreviewBudget] = useState<PreviewResponse['budget'] | null>(null)
  const [previewSectionMetrics, setPreviewSectionMetrics] = useState<Record<string, number> | null>(null)
  const [previewBundle, setPreviewBundle] = useState<BundleJson | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  
  // Ticket selection state
  const [selectedTicketId, setSelectedTicketId] = useState<string>(initialTicketId || '')
  const [selectedTicketPk, setSelectedTicketPk] = useState<string | null>(initialTicketPk)
  const [selectedRepoFullName, setSelectedRepoFullName] = useState<string | null>(initialRepoFullName)
  const [loadingTicket, setLoadingTicket] = useState(false)

  // Artifacts state for preview
  const [artifacts, setArtifacts] = useState<Array<{ artifact_id: string; title: string }>>([])

  // Load most recent bundle and artifacts on open
  useEffect(() => {
    if (isOpen && selectedTicketPk && supabaseUrl && supabaseAnonKey) {
      loadBundles()
      loadArtifacts()
    }
  }, [isOpen, selectedTicketPk, supabaseUrl, supabaseAnonKey])

  // Auto-select most recent bundle when bundles load
  useEffect(() => {
    if (bundles.length > 0 && !selectedBundleId) {
      const mostRecent = bundles[0] // Already sorted by created_at desc
      setSelectedBundleId(mostRecent.bundle_id)
      loadReceipt(mostRecent.bundle_id)
    }
  }, [bundles, selectedBundleId])

  // Preview bundle when role changes
  useEffect(() => {
    if (isOpen && selectedTicketPk && selectedRepoFullName && supabaseUrl && supabaseAnonKey) {
      previewBundleForRole()
    } else {
      setPreviewBudget(null)
      setPreviewSectionMetrics(null)
      setPreviewBundle(null)
    }
  }, [isOpen, selectedTicketPk, selectedRepoFullName, previewRole, supabaseUrl, supabaseAnonKey])

  // Persist selected bundle to localStorage
  useEffect(() => {
    if (selectedBundleId && selectedTicketId) {
      const key = `context-bundle-selected-${selectedTicketId}`
      localStorage.setItem(key, selectedBundleId)
    }
  }, [selectedBundleId, selectedTicketId])

  // Restore selected bundle from localStorage on mount
  useEffect(() => {
    if (isOpen && selectedTicketId && bundles.length > 0) {
      const key = `context-bundle-selected-${selectedTicketId}`
      const savedBundleId = localStorage.getItem(key)
      if (savedBundleId && bundles.some(b => b.bundle_id === savedBundleId)) {
        setSelectedBundleId(savedBundleId)
        loadReceipt(savedBundleId)
      }
    }
  }, [isOpen, selectedTicketId, bundles])

  // Sync initial values when they change
  useEffect(() => {
    if (initialTicketId) setSelectedTicketId(initialTicketId)
    if (initialTicketPk) setSelectedTicketPk(initialTicketPk)
    if (initialRepoFullName) setSelectedRepoFullName(initialRepoFullName)
  }, [initialTicketId, initialTicketPk, initialRepoFullName])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setError(null)
      setReceiptExpanded(false)
      // Don't reset selectedBundleId - keep it for next open
    }
  }, [isOpen])

  const loadTicketInfo = async (ticketId: string) => {
    if (!supabaseUrl || !supabaseAnonKey) return
    
    setLoadingTicket(true)
    setError(null)
    
    try {
      const response = await fetch(`${apiBaseUrl}/api/tickets/get`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ticketId, supabaseUrl, supabaseAnonKey }),
      })
      
      const data = (await response.json()) as {
        success: boolean
        ticket?: { pk: string; id: string; repo_full_name: string }
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
        headers: { 'Content-Type': 'application/json' },
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

    try {
      const response = await fetch(`${apiBaseUrl}/api/artifacts/get`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ticketPk: selectedTicketPk,
          ticketId: selectedTicketId,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const data = (await response.json()) as {
        success: boolean
        artifacts?: Array<{ artifact_id: string; title: string }>
        error?: string
      }

      if (response.ok && data.success && data.artifacts) {
        setArtifacts(data.artifacts)
      }
    } catch (err) {
      // Silently fail - artifacts are optional for preview
      console.error('Failed to load artifacts:', err)
    }
  }

  const loadReceipt = async (bundleId: string) => {
    if (!supabaseUrl || !supabaseAnonKey) return

    setReceiptLoading(true)
    setError(null)

    try {
      const response = await fetch(`${apiBaseUrl}/api/context-bundles/get-receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ bundleId, supabaseUrl, supabaseAnonKey }),
      })

      const data = (await response.json()) as ReceiptResponse

      if (!response.ok || !data.success) {
        setError(data.error || 'Failed to load receipt')
        return
      }

      setReceipt(data.receipt || null)
      setSelectedBundleId(bundleId)

      // Fetch bundle JSON
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

  const previewBundleForRole = async () => {
    if (!selectedTicketPk || !selectedRepoFullName || !supabaseUrl || !supabaseAnonKey) {
      return
    }

    setPreviewLoading(true)
    setError(null)

    try {
      // Get artifact IDs: prefer from selected bundle, fallback to all artifacts
      const artifactIds: string[] = []
      
      if (bundleJson?.relevant_artifacts && Array.isArray(bundleJson.relevant_artifacts)) {
        // Use artifacts from selected bundle
        bundleJson.relevant_artifacts.forEach((artifact: any) => {
          if (artifact.artifact_id) {
            artifactIds.push(artifact.artifact_id)
          }
        })
      } else if (artifacts.length > 0) {
        // Fallback: use all available artifacts
        artifacts.forEach(artifact => {
          artifactIds.push(artifact.artifact_id)
        })
      }

      // If no artifacts available, can't preview
      if (artifactIds.length === 0) {
        setPreviewBudget(null)
        setPreviewSectionMetrics(null)
        setPreviewBundle(null)
        setPreviewLoading(false)
        return
      }

      const response = await fetch(`${apiBaseUrl}/api/context-bundles/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ticketPk: selectedTicketPk,
          ticketId: selectedTicketId,
          repoFullName: selectedRepoFullName,
          role: previewRole,
          selectedArtifactIds: artifactIds,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const data = (await response.json()) as PreviewResponse

      if (!response.ok || !data.success) {
        setPreviewBudget(null)
        setPreviewSectionMetrics(null)
        setPreviewBundle(null)
        return
      }

      setPreviewBudget(data.budget || null)
      setPreviewSectionMetrics(data.sectionMetrics || null)
      setPreviewBundle(data.bundle || null)
    } catch (err) {
      setPreviewBudget(null)
      setPreviewSectionMetrics(null)
      setPreviewBundle(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleUseBundle = async () => {
    if (!previewBudget || !selectedTicketPk || !selectedRepoFullName || !supabaseUrl || !supabaseAnonKey) return
    
    // Check if preview bundle is within budget
    if (previewIsOverBudget) {
      setError('Cannot use bundle: it exceeds the character budget. Please reduce bundle size or select a different role.')
      return
    }

    // Get artifact IDs for generation
    const artifactIds: string[] = []
    if (bundleJson?.relevant_artifacts && Array.isArray(bundleJson.relevant_artifacts)) {
      bundleJson.relevant_artifacts.forEach((artifact: any) => {
        if (artifact.artifact_id) {
          artifactIds.push(artifact.artifact_id)
        }
      })
    } else if (artifacts.length > 0) {
      artifacts.forEach(artifact => {
        artifactIds.push(artifact.artifact_id)
      })
    }

    if (artifactIds.length === 0) {
      setError('No artifacts available to generate bundle.')
      return
    }

    // Generate bundle for the selected role
    try {
      const response = await fetch(`${apiBaseUrl}/api/context-bundles/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ticketPk: selectedTicketPk,
          ticketId: selectedTicketId,
          repoFullName: selectedRepoFullName,
          role: previewRole,
          selectedArtifactIds: artifactIds,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const data = (await response.json()) as {
        success: boolean
        bundle?: { bundle_id: string }
        error?: string
      }

      if (!response.ok || !data.success) {
        setError(data.error || 'Failed to generate bundle')
        return
      }

      // Reload bundles and select the new one
      await loadBundles()
      if (data.bundle?.bundle_id) {
        await loadReceipt(data.bundle.bundle_id)
        setError(null)
        // TODO: Trigger agent run with this bundle
        // For now, just show success
        alert(`Bundle generated successfully for ${previewRole}. Agent run functionality will be implemented next.`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate bundle')
    }
  }

  const formatRole = (role: string): string => {
    const option = ROLE_OPTIONS.find(opt => opt.value === role)
    return option ? option.label : role.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }

  const formatTimestamp = (timestamp: string): string => {
    return new Date(timestamp).toLocaleString()
  }

  const formatBundleContent = (bundle: BundleJson | null): string => {
    if (!bundle) return 'No bundle content available'
    return JSON.stringify(bundle, null, 2)
  }

  if (!isOpen) return null

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Context Bundle</h2>
            <button type="button" className="modal-close" onClick={onClose}>×</button>
          </div>
          <div className="modal-body">
            <p>Supabase connection required to view context bundles.</p>
          </div>
        </div>
      </div>
    )
  }
  
  const needsTicketSelection = !selectedTicketPk && allowTicketSelection
  const isOverBudget = receipt?.budget ? receipt.budget.characterCount > receipt.budget.hardLimit : false
  const previewIsOverBudget = previewBudget ? previewBudget.exceeds : false

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '1200px', maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Context Bundle {selectedTicketId ? `- ${selectedTicketId}` : ''}</h2>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'auto' }}>
          {error && (
            <div style={{ padding: '12px', background: 'var(--hal-status-error, #c62828)', color: 'white', borderRadius: '4px' }}>
              {error}
            </div>
          )}

          {/* Ticket Selection */}
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
                    placeholder="e.g., HAL-0763"
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
              {/* Bundle Selection */}
              <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '18px' }}>Select Bundle</h3>
                {loading ? (
                  <p>Loading bundles...</p>
                ) : bundles.length === 0 ? (
                  <p style={{ color: 'var(--hal-text-muted)' }}>No bundles generated yet for this ticket.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {bundles.map((bundle) => (
                      <div
                        key={bundle.bundle_id}
                        style={{
                          border: `2px solid ${selectedBundleId === bundle.bundle_id ? 'var(--hal-primary, #1976d2)' : 'var(--hal-border)'}`,
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
                          {selectedBundleId === bundle.bundle_id && (
                            <span style={{ fontSize: '12px', color: 'var(--hal-primary, #1976d2)', fontWeight: '600' }}>Selected</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Role Selector and Preview */}
              {selectedBundleId && (
                <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '18px' }}>Preview Bundle for Role</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <label>
                        Role:
                        <select
                          value={previewRole}
                          onChange={(e) => setPreviewRole(e.target.value)}
                          style={{ marginLeft: '8px', padding: '4px 8px' }}
                        >
                          {ROLE_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {/* Budget Status */}
                    {previewBudget && (
                      <div style={{ 
                        border: `2px solid ${previewIsOverBudget ? 'var(--hal-status-error, #c62828)' : 'var(--hal-status-success, #2e7d32)'}`, 
                        borderRadius: '8px', 
                        padding: '16px',
                        background: previewIsOverBudget ? 'var(--hal-status-error-bg, #ffebee)' : 'var(--hal-status-success-bg, #e8f5e9)',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <h4 style={{ margin: 0, fontSize: '16px', color: previewIsOverBudget ? 'var(--hal-status-error, #c62828)' : 'var(--hal-status-success, #2e7d32)' }}>
                            {previewIsOverBudget ? '⚠️ Over Budget' : '✅ Within Budget'}
                          </h4>
                          <span style={{ fontFamily: 'monospace', fontWeight: '600', fontSize: '16px' }}>
                            {previewBudget.characterCount.toLocaleString()} / {previewBudget.hardLimit.toLocaleString()} chars
                          </span>
                        </div>
                        {previewIsOverBudget && (
                          <div style={{ 
                            padding: '8px', 
                            background: 'var(--hal-surface)', 
                            borderRadius: '4px',
                            color: 'var(--hal-status-error, #c62828)',
                            fontWeight: '600',
                            marginTop: '8px',
                          }}>
                            Exceeds limit by {previewBudget.overage.toLocaleString()} characters
                          </div>
                        )}
                      </div>
                    )}

                    {/* Per-Section Breakdown */}
                    {previewSectionMetrics && (
                      <div>
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>Per-Section Breakdown</h4>
                        <div style={{ background: 'var(--hal-surface-alt)', padding: '12px', borderRadius: '4px', border: '1px solid var(--hal-border)' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--hal-border)' }}>
                                <th style={{ textAlign: 'left', padding: '8px', fontWeight: '600' }}>Section</th>
                                <th style={{ textAlign: 'right', padding: '8px', fontWeight: '600' }}>Character Count</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(previewSectionMetrics).map(([section, count]) => (
                                <tr key={section} style={{ borderBottom: '1px solid var(--hal-border)' }}>
                                  <td style={{ padding: '8px' }}>{section}</td>
                                  <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>
                                    {count.toLocaleString()} chars
                                  </td>
                                </tr>
                              ))}
                              <tr style={{ fontWeight: '600', background: 'var(--hal-surface)' }}>
                                <td style={{ padding: '8px' }}>Total</td>
                                <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>
                                  {previewBudget?.characterCount.toLocaleString() || Object.values(previewSectionMetrics).reduce((a, b) => a + b, 0).toLocaleString()} chars
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Bundle Content Preview */}
                    {previewLoading ? (
                      <p>Loading preview...</p>
                    ) : previewBundle ? (
                      <div>
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>Bundle Content Preview</h4>
                        <div style={{ 
                          background: 'var(--hal-surface-alt)', 
                          padding: '12px', 
                          borderRadius: '4px', 
                          border: '1px solid var(--hal-border)',
                          maxHeight: '400px',
                          overflow: 'auto',
                          fontFamily: 'monospace',
                          fontSize: '12px',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}>
                          {formatBundleContent(previewBundle)}
                        </div>
                      </div>
                    ) : null}

                    {/* Use This Bundle Button */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      <button
                        type="button"
                        className="btn-standard"
                        onClick={handleUseBundle}
                        disabled={previewIsOverBudget || !previewBudget}
                        style={{
                          opacity: previewIsOverBudget ? 0.5 : 1,
                          cursor: previewIsOverBudget ? 'not-allowed' : 'pointer',
                        }}
                        title={previewIsOverBudget ? 'Bundle exceeds character budget. Cannot proceed.' : 'Use this bundle to run the selected agent'}
                      >
                        Use This Bundle
                      </button>
                    </div>
                    {previewIsOverBudget && (
                      <div style={{ 
                        padding: '8px', 
                        background: 'var(--hal-status-error-bg, #ffebee)', 
                        borderRadius: '4px',
                        color: 'var(--hal-status-error, #c62828)',
                        fontSize: '14px',
                      }}>
                        Bundle is over budget. Please reduce bundle size or select a different role with a higher limit before proceeding.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Receipt Panel */}
              {selectedBundleId && (
                <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '18px' }}>Bundle Receipt</h3>
                    <button
                      type="button"
                      className="btn-standard"
                      onClick={() => setReceiptExpanded(!receiptExpanded)}
                      style={{ fontSize: '14px', padding: '4px 12px' }}
                    >
                      {receiptExpanded ? 'Collapse' : 'Expand'}
                    </button>
                  </div>
                  {receiptLoading ? (
                    <p>Loading receipt...</p>
                  ) : receipt ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {/* Checksums */}
                      <div>
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>Checksums</h4>
                        <div style={{ fontFamily: 'monospace', fontSize: '12px', background: 'var(--hal-surface-alt)', padding: '8px', borderRadius: '4px' }}>
                          <div style={{ marginBottom: '4px' }}>
                            <strong>Content Checksum (stable):</strong> {receipt.content_checksum}
                          </div>
                          <div>
                            <strong>Bundle Checksum:</strong> {receipt.bundle_checksum}
                          </div>
                        </div>
                      </div>

                      {receiptExpanded && (
                        <>
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
                                  <span style={{ fontFamily: 'monospace' }}>
                                    {receipt.budget.characterCount.toLocaleString()} / {receipt.budget.hardLimit.toLocaleString()}
                                  </span>
                                </div>
                                {isOverBudget && (
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
                              <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                marginTop: '8px',
                                paddingTop: '8px',
                                borderTop: '1px solid var(--hal-border)',
                                fontWeight: '600',
                              }}>
                                <span>Total:</span>
                                <span style={{ fontFamily: 'monospace' }}>{receipt.total_characters.toLocaleString()} chars</span>
                              </div>
                            </div>
                          </div>

                          {/* Provenance and References */}
                          <div>
                            <h4 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>Provenance & References</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px' }}>
                              {receipt.red_reference && (
                                <div>
                                  <strong>RED:</strong> Version {receipt.red_reference.version} (ID: {receipt.red_reference.red_id.substring(0, 8)}...)
                                </div>
                              )}
                              {receipt.integration_manifest_reference && (
                                <div>
                                  <strong>Integration Manifest:</strong> Version {receipt.integration_manifest_reference.version} 
                                  {' '}(Schema: {receipt.integration_manifest_reference.schema_version}, ID: {receipt.integration_manifest_reference.manifest_id.substring(0, 8)}...)
                                </div>
                              )}
                              {receipt.git_ref && (
                                <div>
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
                                <div style={{ color: 'var(--hal-text-muted)' }}>No references</div>
                              )}
                            </div>
                          </div>
                        </>
                      )}
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
