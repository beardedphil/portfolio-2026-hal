import { useState, useEffect, useRef } from 'react'

interface ContextBundleModalProps {
  isOpen: boolean
  onClose: () => void
  ticketPk: string | null
  ticketId: string | null
  repoFullName: string | null
  supabaseUrl: string | null
  supabaseAnonKey: string | null
}

interface BundleListItem {
  bundle_id: string
  ticket_id: string
  role: string
  version: number
  created_at: string
  created_by: string | null
}

interface BundleContent {
  bundle_id: string
  ticket_id: string
  role: string
  version: number
  created_at: string
  bundle_json: unknown
  content_checksum: string
  bundle_checksum: string
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
  integration_manifest_reference: { manifest_id: string; version: number; schema_version: string } | null
  git_ref: { pr_url?: string; pr_number?: number; base_sha?: string; head_sha?: string } | null
  created_at: string
  bundle: {
    bundle_id: string
    ticket_id: string
    role: string
    version: number
    created_at: string
  } | null
}

interface PreviewResult {
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
  bundle?: unknown // Bundle content for preview
  error?: string
}

interface ContinuityCheckResult {
  success: boolean
  passed: boolean
  originalChecksum: string
  rebuiltChecksum: string
  checksumMatch: boolean
  runIdContinuity?: {
    originalRunId?: string | null
    resumedRunId?: string | null
    continuityMaintained: boolean
    explanation: string
  }
  errors: string[]
  warnings: string[]
  details: {
    receiptId: string
    bundleId: string
    ticketPk: string
    ticketId: string
    repoFullName: string
    role: string
    rebuiltFrom: {
      redReference?: { red_id: string; version: number } | null
      integrationManifestReference?: {
        manifest_id: string
        version: number
        schema_version: string
      } | null
      gitRef?: {
        pr_url?: string
        pr_number?: number
        base_sha?: string
        head_sha?: string
      } | null
    }
  }
}

type RoleOption = 'project-manager' | 'implementation-agent' | 'qa-agent' | 'process-review'

const ROLE_OPTIONS: Array<{ value: RoleOption; label: string }> = [
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
}: ContextBundleModalProps) {
  const [ticketPk, setTicketPk] = useState<string | null>(initialTicketPk)
  const [ticketId, setTicketId] = useState<string | null>(initialTicketId)
  const [repoFullName, setRepoFullName] = useState<string | null>(initialRepoFullName)
  const [selectedRole, setSelectedRole] = useState<RoleOption>('project-manager')
  const [bundles, setBundles] = useState<BundleListItem[]>([])
  const [selectedBundleId, setSelectedBundleId] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<BundleReceipt | null>(null)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showReceipt, setShowReceipt] = useState(false)
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [bundlePreviewText, setBundlePreviewText] = useState<string>('')
  const [continuityCheckResult, setContinuityCheckResult] = useState<ContinuityCheckResult | null>(null)
  const [continuityCheckLoading, setContinuityCheckLoading] = useState(false)
  const [showContinuityCheck, setShowContinuityCheck] = useState(false)
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
      setSelectedBundleId(null)
      setReceipt(null)
      setPreview(null)
      setError(null)
      setShowReceipt(false)
      setShowBreakdown(false)
      setBundlePreviewText('')
      setContinuityCheckResult(null)
      setShowContinuityCheck(false)
      if (repoFullName) {
        loadBundles()
      }
    }
  }, [isOpen, initialTicketPk, initialTicketId, initialRepoFullName])

  // Load bundles when repo changes
  useEffect(() => {
    if (isOpen && repoFullName && supabaseUrl && supabaseAnonKey) {
      loadBundles()
    }
  }, [isOpen, repoFullName, supabaseUrl, supabaseAnonKey])

  // Load preview when role or bundle changes (requires ticket info from selected bundle)
  useEffect(() => {
    if (isOpen && selectedBundleId && bundles.length > 0 && repoFullName && supabaseUrl && supabaseAnonKey) {
      const bundle = bundles.find((b) => b.bundle_id === selectedBundleId)
      // Use ticket info from selected bundle for preview
      const bundleTicketId = bundle?.ticket_id
      if (bundleTicketId) {
        loadPreview(bundleTicketId)
      }
    }
  }, [isOpen, selectedRole, selectedBundleId, bundles, repoFullName, supabaseUrl, supabaseAnonKey])

  // Load bundle content when bundle is selected
  useEffect(() => {
    if (isOpen && selectedBundleId && supabaseUrl && supabaseAnonKey) {
      loadBundleContent()
      loadReceipt()
    }
  }, [isOpen, selectedBundleId, supabaseUrl, supabaseAnonKey])

  const loadBundles = async () => {
    if (!repoFullName || !supabaseUrl || !supabaseAnonKey) return

    setLoading(true)
    setError(null)

    try {
      const apiBaseUrl = apiBaseUrlRef.current || window.location.origin
      const response = await fetch(`${apiBaseUrl}/api/context-bundles/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoFullName,
          ticketPk: ticketPk || undefined,
          ticketId: ticketId || undefined,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const data = (await response.json()) as { success: boolean; bundles?: BundleListItem[]; error?: string }

      if (!data.success || !data.bundles) {
        throw new Error(data.error || 'Failed to load bundles')
      }

      setBundles(data.bundles)

      // Try to restore selected bundle from localStorage, or select most recent
      if (data.bundles.length > 0) {
        const storageKey = `context-bundle-selected-${repoFullName}`
        const storedBundleId = localStorage.getItem(storageKey)
        const bundleExists = storedBundleId && data.bundles.some((b) => b.bundle_id === storedBundleId)
        
        if (bundleExists) {
          setSelectedBundleId(storedBundleId)
        } else {
          const mostRecent = data.bundles[0].bundle_id
          setSelectedBundleId(mostRecent)
          localStorage.setItem(storageKey, mostRecent)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bundles')
    } finally {
      setLoading(false)
    }
  }

  const loadBundleContent = async () => {
    if (!selectedBundleId || !supabaseUrl || !supabaseAnonKey) return

    setLoading(true)
    setError(null)

    try {
      const apiBaseUrl = apiBaseUrlRef.current || window.location.origin
      const response = await fetch(`${apiBaseUrl}/api/context-bundles/get`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bundleId: selectedBundleId,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const data = (await response.json()) as { success: boolean; bundle?: BundleContent; error?: string }

      if (!data.success || !data.bundle) {
        throw new Error(data.error || 'Failed to load bundle content')
      }

      // Generate preview text from bundle JSON
      const previewText = JSON.stringify(data.bundle.bundle_json, null, 2)
      setBundlePreviewText(previewText)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bundle content')
    } finally {
      setLoading(false)
    }
  }

  const loadReceipt = async () => {
    if (!selectedBundleId || !supabaseUrl || !supabaseAnonKey) return

    try {
      const apiBaseUrl = apiBaseUrlRef.current || window.location.origin
      const response = await fetch(`${apiBaseUrl}/api/context-bundles/get-receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bundleId: selectedBundleId,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const data = (await response.json()) as { success: boolean; receipt?: BundleReceipt; error?: string }

      if (data.success && data.receipt) {
        setReceipt(data.receipt)
      }
    } catch (err) {
      console.error('Failed to load receipt:', err)
    }
  }

  const loadPreview = async (previewTicketId?: string) => {
    const ticketIdToUse = previewTicketId || ticketId
    if (!repoFullName || !ticketIdToUse || !supabaseUrl || !supabaseAnonKey) return

    setLoading(true)
    setError(null)

    try {
      const apiBaseUrl = apiBaseUrlRef.current || window.location.origin
      const response = await fetch(`${apiBaseUrl}/api/context-bundles/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: ticketIdToUse,
          repoFullName,
          role: selectedRole,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const data = (await response.json()) as PreviewResult

      if (!data.success) {
        throw new Error(data.error || 'Failed to preview bundle')
      }

      setPreview(data)

      // Generate preview text from preview bundle if available
      if (data.bundle) {
        const previewText = JSON.stringify(data.bundle, null, 2)
        setBundlePreviewText(previewText)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to preview bundle')
      setPreview(null)
    } finally {
      setLoading(false)
    }
  }

  const handleUseBundle = () => {
    if (!preview || preview.budget?.exceeds) {
      return
    }

    // TODO: Implement "Use this bundle" functionality
    // This would typically trigger an agent run with the selected bundle
    console.log('Use bundle:', selectedBundleId, selectedRole)
    alert('"Use this bundle" functionality will be implemented to trigger agent run with selected bundle.')
  }

  const runContinuityCheck = async () => {
    if (!receipt || !supabaseUrl || !supabaseAnonKey) return

    setContinuityCheckLoading(true)
    setContinuityCheckResult(null)
    setShowContinuityCheck(true)

    try {
      const apiBaseUrl = apiBaseUrlRef.current || window.location.origin
      const response = await fetch(`${apiBaseUrl}/api/context-bundles/check-continuity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiptId: receipt.receipt_id,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const data = (await response.json()) as ContinuityCheckResult

      if (!data.success) {
        throw new Error(data.errors?.join(', ') || 'Failed to run continuity check')
      }

      setContinuityCheckResult(data)
    } catch (err) {
      setContinuityCheckResult({
        success: false,
        passed: false,
        originalChecksum: receipt.content_checksum,
        rebuiltChecksum: '',
        checksumMatch: false,
        errors: [err instanceof Error ? err.message : 'Failed to run continuity check'],
        warnings: [],
        details: {
          receiptId: receipt.receipt_id,
          bundleId: receipt.bundle_id,
          ticketPk: '',
          ticketId: receipt.ticket_id,
          repoFullName: '',
          role: receipt.role,
          rebuiltFrom: {},
        },
      })
    } finally {
      setContinuityCheckLoading(false)
    }
  }

  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat().format(num)
  }

  if (!isOpen) return null

  const selectedBundle = bundles.find((b) => b.bundle_id === selectedBundleId)
  const isWithinBudget = preview?.budget ? !preview.budget.exceeds : false
  const previewTicketId = selectedBundle?.ticket_id || ticketId
  const characterCount = preview?.budget?.characterCount || 0
  const characterLimit = preview?.budget?.hardLimit || 0
  const sectionMetrics = preview?.sectionMetrics || receipt?.section_metrics || {}

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: '1200px', maxHeight: '90vh', width: '95%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Context Bundle {selectedBundle ? `- ${selectedBundle.ticket_id || 'Bundle'}` : ''}</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'auto' }}>
          {!supabaseUrl || !supabaseAnonKey ? (
            <div style={{ padding: '16px', background: 'var(--hal-surface-alt)', borderRadius: '8px' }}>
              <p>Supabase connection required to view context bundles.</p>
            </div>
          ) : !repoFullName ? (
            <div style={{ padding: '16px', background: 'var(--hal-surface-alt)', borderRadius: '8px' }}>
              <p>Repository selection required to view context bundles.</p>
            </div>
          ) : (
            <>
              {/* Repository and Ticket Info */}
              <div style={{ padding: '12px', background: 'var(--hal-surface-alt)', borderRadius: '8px', fontSize: '14px' }}>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <div>
                    <strong>Repository:</strong> {repoFullName}
                  </div>
                  {previewTicketId && (
                    <div>
                      <strong>Ticket:</strong> {previewTicketId}
                    </div>
                  )}
                </div>
              </div>

              {/* Bundle Selection */}
              {bundles.length > 0 && (
                <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Select Bundle</h3>
                  <select
                    value={selectedBundleId || ''}
                    onChange={(e) => {
                      const newBundleId = e.target.value
                      setSelectedBundleId(newBundleId)
                      // Persist selection
                      if (repoFullName) {
                        localStorage.setItem(`context-bundle-selected-${repoFullName}`, newBundleId)
                      }
                    }}
                    style={{ width: '100%', padding: '8px', fontSize: '14px' }}
                  >
                    {bundles.map((bundle) => (
                      <option key={bundle.bundle_id} value={bundle.bundle_id}>
                        {bundle.ticket_id} - {bundle.role} (v{bundle.version}) - {new Date(bundle.created_at).toLocaleString()}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {loading && bundles.length === 0 && <p>Loading bundles...</p>}

              {error && (
                <div style={{ padding: '12px', background: 'var(--hal-status-error, #c62828)', color: 'white', borderRadius: '4px' }}>
                  <strong>Error:</strong> {error}
                </div>
              )}

              {bundles.length === 0 && !loading && !error && (
                <div style={{ padding: '16px', background: 'var(--hal-surface-alt)', borderRadius: '8px' }}>
                  <p>No bundles found for this repository. Generate a bundle first.</p>
                </div>
              )}

              {selectedBundleId && (
                <>
                  {/* Role Selector */}
                  <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Agent Role</h3>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {ROLE_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setSelectedRole(option.value)}
                          style={{
                            padding: '8px 16px',
                            borderRadius: '4px',
                            border: '1px solid var(--hal-border)',
                            background: selectedRole === option.value ? 'var(--hal-primary, #1976d2)' : 'transparent',
                            color: selectedRole === option.value ? 'white' : 'var(--hal-text)',
                            cursor: 'pointer',
                            fontSize: '14px',
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Budget Status */}
                  {preview?.budget && (
                    <div
                      style={{
                        padding: '16px',
                        background: isWithinBudget ? 'var(--hal-status-success, #2e7d32)' : 'var(--hal-status-error, #c62828)',
                        color: 'white',
                        borderRadius: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <strong style={{ fontSize: '18px' }}>
                          {isWithinBudget ? '✓ Within Budget' : '✗ Over Budget'}
                        </strong>
                        <div style={{ fontSize: '14px' }}>
                          {formatNumber(characterCount)} / {formatNumber(characterLimit)} characters
                        </div>
                      </div>
                      {!isWithinBudget && preview.budget.overage > 0 && (
                        <div style={{ fontSize: '14px', opacity: 0.9 }}>
                          {formatNumber(preview.budget.overage)} characters over limit
                        </div>
                      )}
                    </div>
                  )}

                  {/* Section Breakdown */}
                  <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <h3 style={{ margin: 0, fontSize: '16px' }}>Section Breakdown</h3>
                      <button
                        type="button"
                        onClick={() => setShowBreakdown(!showBreakdown)}
                        style={{
                          padding: '4px 8px',
                          fontSize: '12px',
                          border: '1px solid var(--hal-border)',
                          borderRadius: '4px',
                          background: 'transparent',
                          cursor: 'pointer',
                        }}
                      >
                        {showBreakdown ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    {showBreakdown && (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--hal-border)' }}>
                              <th style={{ textAlign: 'left', padding: '8px' }}>Section</th>
                              <th style={{ textAlign: 'right', padding: '8px' }}>Characters</th>
                              <th style={{ textAlign: 'right', padding: '8px' }}>Percentage</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(sectionMetrics).map(([section, count]) => {
                              const percentage = characterCount > 0 ? ((count / characterCount) * 100).toFixed(1) : '0.0'
                              return (
                                <tr key={section} style={{ borderBottom: '1px solid var(--hal-border)' }}>
                                  <td style={{ padding: '8px' }}>{section}</td>
                                  <td style={{ textAlign: 'right', padding: '8px' }}>{formatNumber(count)}</td>
                                  <td style={{ textAlign: 'right', padding: '8px' }}>{percentage}%</td>
                                </tr>
                              )
                            })}
                            <tr style={{ borderTop: '2px solid var(--hal-border)', fontWeight: 'bold' }}>
                              <td style={{ padding: '8px' }}>Total</td>
                              <td style={{ textAlign: 'right', padding: '8px' }}>{formatNumber(characterCount)}</td>
                              <td style={{ textAlign: 'right', padding: '8px' }}>100%</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Bundle Preview */}
                  {(bundlePreviewText || preview?.bundle) && (
                    <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
                      <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>
                        Bundle Preview ({ROLE_OPTIONS.find((r) => r.value === selectedRole)?.label || selectedRole})
                      </h3>
                      <div
                        style={{
                          background: 'var(--hal-surface-alt)',
                          padding: '12px',
                          borderRadius: '4px',
                          maxHeight: '400px',
                          overflow: 'auto',
                          fontFamily: 'monospace',
                          fontSize: '12px',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {bundlePreviewText ? (
                          <>
                            {bundlePreviewText.substring(0, 10000)}
                            {bundlePreviewText.length > 10000 && '... (truncated)'}
                          </>
                        ) : preview?.bundle ? (
                          <>
                            {JSON.stringify(preview.bundle, null, 2).substring(0, 10000)}
                            {JSON.stringify(preview.bundle, null, 2).length > 10000 && '... (truncated)'}
                          </>
                        ) : null}
                      </div>
                    </div>
                  )}

                  {/* Receipt Panel */}
                  {receipt && (
                    <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h3 style={{ margin: 0, fontSize: '16px' }}>Receipt</h3>
                        <button
                          type="button"
                          onClick={() => setShowReceipt(!showReceipt)}
                          style={{
                            padding: '4px 8px',
                            fontSize: '12px',
                            border: '1px solid var(--hal-border)',
                            borderRadius: '4px',
                            background: 'transparent',
                            cursor: 'pointer',
                          }}
                        >
                          {showReceipt ? 'Hide' : 'Show'}
                        </button>
                      </div>
                      {showReceipt && (
                        <div style={{ fontSize: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div>
                            <strong>Content Checksum (stable):</strong>{' '}
                            <code style={{ fontSize: '12px', fontFamily: 'monospace' }}>{receipt.content_checksum}</code>
                          </div>
                          <div>
                            <strong>Bundle Checksum:</strong>{' '}
                            <code style={{ fontSize: '12px', fontFamily: 'monospace' }}>{receipt.bundle_checksum}</code>
                          </div>
                          {receipt.red_reference && (
                            <div>
                              <strong>RED Reference:</strong> {receipt.red_reference.red_id} (v{receipt.red_reference.version})
                            </div>
                          )}
                          {receipt.integration_manifest_reference && (
                            <div>
                              <strong>Integration Manifest:</strong> {receipt.integration_manifest_reference.manifest_id} (v
                              {receipt.integration_manifest_reference.version}, schema {receipt.integration_manifest_reference.schema_version})
                            </div>
                          )}
                          {receipt.git_ref && (
                            <div>
                              <strong>Git Reference:</strong>{' '}
                              {receipt.git_ref.pr_url ? (
                                <a href={receipt.git_ref.pr_url} target="_blank" rel="noopener noreferrer">
                                  PR #{receipt.git_ref.pr_number}
                                </a>
                              ) : (
                                <>
                                  {receipt.git_ref.base_sha?.substring(0, 8)}... → {receipt.git_ref.head_sha?.substring(0, 8)}...
                                </>
                              )}
                            </div>
                          )}
                          <div>
                            <strong>Created:</strong> {new Date(receipt.created_at).toLocaleString()}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Cold-start Continuity Check */}
                  {receipt && (
                    <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h3 style={{ margin: 0, fontSize: '16px' }}>Cold-start Continuity Check</h3>
                        <button
                          type="button"
                          onClick={runContinuityCheck}
                          disabled={continuityCheckLoading}
                          style={{
                            padding: '8px 16px',
                            fontSize: '14px',
                            border: '1px solid var(--hal-border)',
                            borderRadius: '4px',
                            background: continuityCheckLoading ? 'var(--hal-surface-alt)' : 'var(--hal-primary, #1976d2)',
                            color: 'white',
                            cursor: continuityCheckLoading ? 'not-allowed' : 'pointer',
                            opacity: continuityCheckLoading ? 0.6 : 1,
                          }}
                        >
                          {continuityCheckLoading ? 'Running...' : 'Run Check'}
                        </button>
                      </div>
                      {showContinuityCheck && continuityCheckResult && (
                        <div style={{ fontSize: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {/* Pass/Fail Status */}
                          <div
                            style={{
                              padding: '12px',
                              background: continuityCheckResult.passed
                                ? 'var(--hal-status-success, #2e7d32)'
                                : 'var(--hal-status-error, #c62828)',
                              color: 'white',
                              borderRadius: '4px',
                              fontWeight: 'bold',
                            }}
                          >
                            {continuityCheckResult.passed ? '✓ PASS' : '✗ FAIL'}
                          </div>

                          {/* Checksum Comparison */}
                          <div style={{ padding: '12px', background: 'var(--hal-surface-alt)', borderRadius: '4px' }}>
                            <div style={{ marginBottom: '8px' }}>
                              <strong>Content Checksum Match:</strong>{' '}
                              {continuityCheckResult.checksumMatch ? (
                                <span style={{ color: 'var(--hal-status-success, #2e7d32)' }}>✓ Match</span>
                              ) : (
                                <span style={{ color: 'var(--hal-status-error, #c62828)' }}>✗ Mismatch</span>
                              )}
                            </div>
                            <div style={{ fontSize: '12px', fontFamily: 'monospace', marginTop: '4px' }}>
                              <div>
                                <strong>Original:</strong> {continuityCheckResult.originalChecksum.substring(0, 32)}...
                              </div>
                              <div>
                                <strong>Rebuilt:</strong> {continuityCheckResult.rebuiltChecksum.substring(0, 32)}...
                              </div>
                            </div>
                          </div>

                          {/* Run ID Continuity */}
                          {continuityCheckResult.runIdContinuity && (
                            <div style={{ padding: '12px', background: 'var(--hal-surface-alt)', borderRadius: '4px' }}>
                              <div style={{ marginBottom: '8px' }}>
                                <strong>Run ID Continuity:</strong>{' '}
                                {continuityCheckResult.runIdContinuity.continuityMaintained ? (
                                  <span style={{ color: 'var(--hal-status-success, #2e7d32)' }}>✓ Maintained</span>
                                ) : (
                                  <span style={{ color: 'var(--hal-status-error, #c62828)' }}>✗ Broken</span>
                                )}
                              </div>
                              <div style={{ fontSize: '12px', marginTop: '4px' }}>
                                {continuityCheckResult.runIdContinuity.explanation}
                              </div>
                              {continuityCheckResult.runIdContinuity.originalRunId && (
                                <div style={{ fontSize: '12px', fontFamily: 'monospace', marginTop: '4px' }}>
                                  <div>
                                    <strong>Original Run ID:</strong> {continuityCheckResult.runIdContinuity.originalRunId}
                                  </div>
                                  {continuityCheckResult.runIdContinuity.resumedRunId && (
                                    <div>
                                      <strong>Resumed Run ID:</strong> {continuityCheckResult.runIdContinuity.resumedRunId}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Errors */}
                          {continuityCheckResult.errors.length > 0 && (
                            <div style={{ padding: '12px', background: 'var(--hal-status-error, #c62828)', color: 'white', borderRadius: '4px' }}>
                              <strong>Errors:</strong>
                              <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                                {continuityCheckResult.errors.map((error, idx) => (
                                  <li key={idx} style={{ marginTop: '4px' }}>
                                    {error}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Warnings */}
                          {continuityCheckResult.warnings.length > 0 && (
                            <div style={{ padding: '12px', background: 'var(--hal-surface-alt)', borderRadius: '4px', border: '1px solid #ff9800' }}>
                              <strong>Warnings:</strong>
                              <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                                {continuityCheckResult.warnings.map((warning, idx) => (
                                  <li key={idx} style={{ marginTop: '4px' }}>
                                    {warning}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Details */}
                          <div style={{ padding: '12px', background: 'var(--hal-surface-alt)', borderRadius: '4px', fontSize: '12px' }}>
                            <strong>Rebuilt From:</strong>
                            <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {continuityCheckResult.details.rebuiltFrom.redReference && (
                                <div>
                                  RED: {continuityCheckResult.details.rebuiltFrom.redReference.red_id} (v
                                  {continuityCheckResult.details.rebuiltFrom.redReference.version})
                                </div>
                              )}
                              {continuityCheckResult.details.rebuiltFrom.integrationManifestReference && (
                                <div>
                                  Integration Manifest: {continuityCheckResult.details.rebuiltFrom.integrationManifestReference.manifest_id} (v
                                  {continuityCheckResult.details.rebuiltFrom.integrationManifestReference.version})
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Use Bundle Button */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '8px' }}>
                    <button type="button" className="btn-standard" onClick={onClose}>
                      Close
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={handleUseBundle}
                      disabled={!preview || preview.budget?.exceeds || !isWithinBudget}
                      style={{
                        opacity: !preview || preview.budget?.exceeds || !isWithinBudget ? 0.5 : 1,
                        cursor: !preview || preview.budget?.exceeds || !isWithinBudget ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Use this bundle
                    </button>
                  </div>

                  {!isWithinBudget && preview?.budget && (
                    <div style={{ padding: '12px', background: 'var(--hal-surface-alt)', borderRadius: '4px', fontSize: '14px' }}>
                      <strong>Cannot proceed:</strong> Bundle exceeds character budget for {preview.budget.displayName}. Reduce bundle size or select a different role.
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
