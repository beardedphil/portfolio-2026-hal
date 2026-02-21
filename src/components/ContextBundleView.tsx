import { useState, useEffect } from 'react'

interface ContextBundleViewProps {
  repoFullName: string | null
  supabaseUrl: string | null
  supabaseAnonKey: string | null
  onUseBundle?: (data: { bundleId: string; role: string; ticketPk: string; ticketId: string }) => void | Promise<void>
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
  ticket_pk?: string
  repo_full_name?: string
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

interface BundleJson {
  meta: {
    project_id: string
    ticket_id: string
    role: string
    bundle_id?: string
    created_at: string
    content_checksum?: string
    bundle_checksum?: string
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

type RoleOption = 'project-manager' | 'implementation-agent' | 'qa-agent' | 'process-review'

const ROLE_OPTIONS: Array<{ value: RoleOption; label: string }> = [
  { value: 'project-manager', label: 'PM' },
  { value: 'implementation-agent', label: 'Dev' },
  { value: 'qa-agent', label: 'QA' },
  { value: 'process-review', label: 'Process Review' },
]

export function ContextBundleView({
  repoFullName,
  supabaseUrl,
  supabaseAnonKey,
  onUseBundle,
}: ContextBundleViewProps) {
  const apiBaseUrl = import.meta.env.VITE_HAL_API_BASE_URL || window.location.origin
  const [bundles, setBundles] = useState<Bundle[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedBundle, setSelectedBundle] = useState<Bundle | null>(null)
  const [selectedRole, setSelectedRole] = useState<RoleOption>('implementation-agent')
  const [receipt, setReceipt] = useState<BundleReceipt | null>(null)
  const [receiptLoading, setReceiptLoading] = useState(false)
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [previewBudget, setPreviewBudget] = useState<PreviewResponse['budget'] | null>(null)
  const [previewSectionMetrics, setPreviewSectionMetrics] = useState<Record<string, number> | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [bundleJson, setBundleJson] = useState<BundleJson | null>(null)
  const [breakdownOpen, setBreakdownOpen] = useState(false)

  // Load most recent bundle when repo changes
  useEffect(() => {
    if (repoFullName && supabaseUrl && supabaseAnonKey) {
      loadMostRecentBundle()
    } else {
      setBundles([])
      setSelectedBundle(null)
      setReceipt(null)
      setPreviewBudget(null)
      setPreviewSectionMetrics(null)
      setBundleJson(null)
    }
  }, [repoFullName, supabaseUrl, supabaseAnonKey])

  // Load receipt when bundle is selected
  useEffect(() => {
    if (selectedBundle && supabaseUrl && supabaseAnonKey) {
      loadReceipt(selectedBundle.bundle_id)
    } else {
      setReceipt(null)
      setBundleJson(null)
    }
  }, [selectedBundle, supabaseUrl, supabaseAnonKey])

  // Preview bundle for selected role when bundle or role changes
  useEffect(() => {
    if (selectedBundle && selectedRole && supabaseUrl && supabaseAnonKey && receipt) {
      previewBundleForRole()
    } else {
      setPreviewBudget(null)
      setPreviewSectionMetrics(null)
    }
  }, [selectedBundle, selectedRole, receipt, supabaseUrl, supabaseAnonKey])

  // Restore state from localStorage on mount
  useEffect(() => {
    if (repoFullName) {
      try {
        const stored = localStorage.getItem(`context-bundle-view-${repoFullName}`)
        if (stored) {
          const parsed = JSON.parse(stored)
          if (parsed.selectedRole) {
            setSelectedRole(parsed.selectedRole)
          }
          if (parsed.receiptOpen !== undefined) {
            setReceiptOpen(parsed.receiptOpen)
          }
          if (parsed.breakdownOpen !== undefined) {
            setBreakdownOpen(parsed.breakdownOpen)
          }
        }
      } catch {
        // Ignore parse errors
      }
    }
  }, [repoFullName])

  // Persist state to localStorage
  useEffect(() => {
    if (repoFullName) {
      try {
        localStorage.setItem(
          `context-bundle-view-${repoFullName}`,
          JSON.stringify({
            selectedRole: selectedRole,
            receiptOpen,
            breakdownOpen,
          })
        )
      } catch {
        // Ignore storage errors
      }
    }
  }, [repoFullName, selectedRole, receiptOpen, breakdownOpen])

  const loadMostRecentBundle = async () => {
    if (!repoFullName || !supabaseUrl || !supabaseAnonKey) return

    setLoading(true)
    setError(null)

    try {
      // First, we need to get a ticket for this repo to list bundles
      // For now, we'll list all bundles for the repo (we may need to adjust the API)
      // Actually, the list API requires a ticketPk or ticketId, so we need a different approach
      // Let me check if we can query by repo_full_name directly
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(supabaseUrl, supabaseAnonKey)

      // Query bundles by repo_full_name directly
      const { data: bundlesData, error: bundlesError } = await supabase
        .from('context_bundles')
        .select('bundle_id, ticket_id, role, version, created_at, created_by, ticket_pk, repo_full_name')
        .eq('repo_full_name', repoFullName)
        .order('created_at', { ascending: false })
        .limit(1)

      if (bundlesError) {
        setError(`Failed to load bundles: ${bundlesError.message}`)
        return
      }

      if (bundlesData && bundlesData.length > 0) {
        const bundle = bundlesData[0]
        setBundles([bundle])
        setSelectedBundle(bundle)
      } else {
        setBundles([])
        setSelectedBundle(null)
      }
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

      // Also fetch the bundle JSON
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(supabaseUrl, supabaseAnonKey)
      const { data: bundleData, error: bundleError } = await supabase
        .from('context_bundles')
        .select('bundle_json, ticket_pk, ticket_id')
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
    if (!selectedBundle || !receipt || !supabaseUrl || !supabaseAnonKey) return

    // Get ticket info from receipt or bundle
    const ticketId = receipt.ticket_id
    if (!ticketId) return

    setPreviewLoading(true)
    setError(null)

    try {
      // We need ticketPk and repoFullName for preview
      // Get ticket info first
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(supabaseUrl, supabaseAnonKey)
      const { data: ticketData, error: ticketError } = await supabase
        .from('tickets')
        .select('pk, repo_full_name')
        .eq('id', ticketId)
        .maybeSingle()

      if (ticketError || !ticketData) {
        // Don't set error for preview failures - just clear preview
        setPreviewBudget(null)
        setPreviewSectionMetrics(null)
        return
      }

      // Call the preview API with the selected role
      // The preview API will rebuild the bundle for the selected role
      const response = await fetch(`${apiBaseUrl}/api/context-bundles/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          ticketPk: ticketData.pk,
          ticketId,
          repoFullName: ticketData.repo_full_name,
          role: selectedRole,
          supabaseUrl,
          supabaseAnonKey,
          // We don't have selectedArtifactIds from the existing bundle, so preview will use all artifacts
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
      // Don't set error for preview failures
      setPreviewBudget(null)
      setPreviewSectionMetrics(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleUseBundle = async () => {
    if (!selectedBundle || !receipt || !previewBudget || previewBudget.exceeds) return
    if (!onUseBundle) return

    // Get ticket info
    const ticketId = receipt.ticket_id
    if (!ticketId) return

    try {
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '')
      const { data: ticketData } = await supabase
        .from('tickets')
        .select('pk')
        .eq('id', ticketId)
        .maybeSingle()

      if (ticketData?.pk) {
        await onUseBundle({
          bundleId: selectedBundle.bundle_id,
          role: selectedRole,
          ticketPk: ticketData.pk,
          ticketId,
        })
      } else {
        setError('Failed to load ticket information')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to use bundle')
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

  if (!repoFullName) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--hal-text-muted)' }}>
        <p>Please connect a GitHub repository to view context bundles.</p>
      </div>
    )
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--hal-text-muted)' }}>
        <p>Supabase connection required to view context bundles.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: '0 0 8px 0', fontSize: '24px' }}>Context Bundle</h2>
        <p style={{ margin: 0, color: 'var(--hal-text-muted)', fontSize: '14px' }}>
          View and use context bundles for {repoFullName}
        </p>
      </div>

      {error && (
        <div style={{ padding: '12px', background: 'var(--hal-status-error, #c62828)', color: 'white', borderRadius: '4px', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {loading ? (
        <p>Loading bundles...</p>
      ) : !selectedBundle ? (
        <div style={{ padding: '24px', textAlign: 'center', border: '1px solid var(--hal-border)', borderRadius: '8px' }}>
          <p style={{ color: 'var(--hal-text-muted)' }}>No bundles generated yet for this repository.</p>
          <p style={{ color: 'var(--hal-text-muted)', fontSize: '14px', marginTop: '8px' }}>
            Generate a bundle from the Context Bundle modal to view it here.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Bundle Info */}
          <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '18px' }}>
                  {formatRole(selectedBundle.role)} - Version {selectedBundle.version}
                </h3>
                <p style={{ margin: 0, color: 'var(--hal-text-muted)', fontSize: '14px' }}>
                  Ticket: {selectedBundle.ticket_id} • {formatTimestamp(selectedBundle.created_at)}
                </p>
              </div>
            </div>
          </div>

          {/* Role Selector */}
          <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '18px' }}>Select Role</h3>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {ROLE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={selectedRole === option.value ? 'btn-standard' : 'btn-standard'}
                  onClick={() => setSelectedRole(option.value)}
                  style={{
                    padding: '8px 16px',
                    background: selectedRole === option.value ? 'var(--hal-primary, #1976d2)' : 'var(--hal-surface-alt)',
                    color: selectedRole === option.value ? 'white' : 'var(--hal-text)',
                    border: `1px solid ${selectedRole === option.value ? 'var(--hal-primary, #1976d2)' : 'var(--hal-border)'}`,
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: selectedRole === option.value ? '600' : '400',
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Budget Status */}
          {previewLoading ? (
            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--hal-text-muted)' }}>
              Loading preview...
            </div>
          ) : previewBudget ? (
            <div
              style={{
                border: `2px solid ${previewBudget.exceeds ? 'var(--hal-status-error, #c62828)' : 'var(--hal-border)'}`,
                borderRadius: '8px',
                padding: '16px',
                background: previewBudget.exceeds ? 'var(--hal-status-error-bg, #ffebee)' : 'var(--hal-surface-alt)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', color: previewBudget.exceeds ? 'var(--hal-status-error, #c62828)' : 'inherit' }}>
                  Budget Status: {previewBudget.exceeds ? 'Over Budget' : 'Within Budget'}
                </h3>
                <div style={{ fontFamily: 'monospace', fontSize: '16px', fontWeight: '600' }}>
                  {previewBudget.characterCount.toLocaleString()} / {previewBudget.hardLimit.toLocaleString()} chars
                </div>
              </div>
              {previewBudget.exceeds && (
                <div
                  style={{
                    padding: '12px',
                    background: 'var(--hal-surface)',
                    borderRadius: '4px',
                    color: 'var(--hal-status-error, #c62828)',
                    fontWeight: '600',
                    marginBottom: '12px',
                  }}
                >
                  ⚠️ Exceeds limit by {previewBudget.overage.toLocaleString()} characters
                </div>
              )}
              <div style={{ fontSize: '14px', color: 'var(--hal-text-muted)' }}>
                Role: {previewBudget.displayName} • Limit: {previewBudget.hardLimit.toLocaleString()} characters
              </div>
            </div>
          ) : (
            <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
              <p style={{ margin: 0, color: 'var(--hal-text-muted)' }}>Preview not available</p>
            </div>
          )}

          {/* Section Breakdown */}
          {previewSectionMetrics && (
            <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '18px' }}>Section Breakdown</h3>
                <button
                  type="button"
                  className="btn-standard"
                  onClick={() => setBreakdownOpen(!breakdownOpen)}
                  style={{ padding: '4px 12px', fontSize: '14px' }}
                >
                  {breakdownOpen ? 'Hide' : 'Show'}
                </button>
              </div>
              {breakdownOpen && (
                <div style={{ background: 'var(--hal-surface-alt)', padding: '12px', borderRadius: '4px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {Object.entries(previewSectionMetrics).map(([section, count]) => (
                      <div key={section} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                        <span>{section}:</span>
                        <span style={{ fontFamily: 'monospace', fontWeight: '500' }}>{count.toLocaleString()} chars</span>
                      </div>
                    ))}
                    {previewBudget && (
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginTop: '8px',
                          paddingTop: '8px',
                          borderTop: '1px solid var(--hal-border)',
                          fontWeight: '600',
                          fontSize: '14px',
                        }}
                      >
                        <span>Total:</span>
                        <span style={{ fontFamily: 'monospace' }}>{previewBudget.characterCount.toLocaleString()} chars</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Use Bundle Button */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button
              type="button"
              className="btn-standard"
              onClick={handleUseBundle}
              disabled={!previewBudget || previewBudget.exceeds || !onUseBundle}
              style={{
                padding: '12px 24px',
                fontSize: '16px',
                fontWeight: '600',
                opacity: !previewBudget || previewBudget.exceeds || !onUseBundle ? 0.5 : 1,
                cursor: !previewBudget || previewBudget.exceeds || !onUseBundle ? 'not-allowed' : 'pointer',
              }}
            >
              Use this bundle
            </button>
            {previewBudget?.exceeds && (
              <p style={{ margin: 0, color: 'var(--hal-status-error, #c62828)', fontSize: '14px' }}>
                Bundle exceeds budget. Please reduce bundle size before using.
              </p>
            )}
          </div>

          {/* Receipt Panel */}
          <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '18px' }}>Receipt</h3>
              <button
                type="button"
                className="btn-standard"
                onClick={() => setReceiptOpen(!receiptOpen)}
                style={{ padding: '4px 12px', fontSize: '14px' }}
              >
                {receiptOpen ? 'Hide' : 'Show'}
              </button>
            </div>
            {receiptOpen && (
              <div>
                {receiptLoading ? (
                  <p>Loading receipt...</p>
                ) : receipt ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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

                    {/* Provenance */}
                    <div>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>Provenance</h4>
                      <div style={{ background: 'var(--hal-surface-alt)', padding: '12px', borderRadius: '4px', fontSize: '14px' }}>
                        <div style={{ marginBottom: '4px' }}>
                          <strong>Bundle ID:</strong> {receipt.bundle_id}
                        </div>
                        <div style={{ marginBottom: '4px' }}>
                          <strong>Ticket ID:</strong> {receipt.ticket_id}
                        </div>
                        <div style={{ marginBottom: '4px' }}>
                          <strong>Role:</strong> {formatRole(receipt.role)}
                        </div>
                        <div style={{ marginBottom: '4px' }}>
                          <strong>Created:</strong> {formatTimestamp(receipt.created_at)}
                        </div>
                        {receipt.bundle && (
                          <div>
                            <strong>Version:</strong> {receipt.bundle.version}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* References */}
                    <div>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>References</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px' }}>
                        {receipt.red_reference && (
                          <div>
                            <strong>RED:</strong> Version {receipt.red_reference.version} (ID: {receipt.red_reference.red_id.substring(0, 8)}...)
                          </div>
                        )}
                        {receipt.integration_manifest_reference && (
                          <div>
                            <strong>Integration Manifest:</strong> Version {receipt.integration_manifest_reference.version} (Schema: {receipt.integration_manifest_reference.schema_version}, ID: {receipt.integration_manifest_reference.manifest_id.substring(0, 8)}...)
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
                  </div>
                ) : (
                  <p style={{ color: 'var(--hal-text-muted)' }}>Receipt not available.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
