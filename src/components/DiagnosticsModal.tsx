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

interface Failure {
  id: string
  failure_type: string
  root_cause: string | null
  prevention_candidate: string | null
  recurrence_count: number
  first_seen_at: string
  last_seen_at: string
  source_type: 'drift_attempt' | 'agent_outcome'
  source_id: string | null
  ticket_pk: string | null
  metadata: Record<string, any>
}

interface Policy {
  id: string
  policy_key: string
  name: string
  description: string
  status: 'off' | 'trial' | 'promoted'
  created_at: string
  updated_at: string
  last_changed_at: string
  metadata: Record<string, any>
}

interface PolicyMetrics {
  baseline_event_count: number
  trial_event_count: number
  baseline_window_start: string | null
  baseline_window_end: string | null
  trial_window_start: string | null
  trial_window_end: string | null
}

interface PolicyAuditLog {
  id: string
  policy_id: string
  action: string
  from_status: string
  to_status: string
  actor: string | null
  created_at: string
  metadata: Record<string, any>
}

interface DiagnosticsModalProps {
  isOpen: boolean
  onClose: () => void
  supabaseUrl: string | null
  supabaseAnonKey: string | null
  openaiApiKey?: string | null
}

export function DiagnosticsModal({
  isOpen,
  onClose,
  supabaseUrl,
  supabaseAnonKey,
  openaiApiKey,
}: DiagnosticsModalProps) {
  const [embeddingsStatus, setEmbeddingsStatus] = useState<EmbeddingsStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [failures, setFailures] = useState<Failure[]>([])
  const [loadingFailures, setLoadingFailures] = useState(false)
  const [failuresError, setFailuresError] = useState<string | null>(null)
  const [selectedFailure, setSelectedFailure] = useState<Failure | null>(null)
  const [policies, setPolicies] = useState<Policy[]>([])
  const [loadingPolicies, setLoadingPolicies] = useState(false)
  const [policiesError, setPoliciesError] = useState<string | null>(null)
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null)
  const [policyMetrics, setPolicyMetrics] = useState<PolicyMetrics | null>(null)
  const [loadingMetrics, setLoadingMetrics] = useState(false)
  const [policyAuditLogs, setPolicyAuditLogs] = useState<PolicyAuditLog[]>([])
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false)
  const [updatingPolicyStatus, setUpdatingPolicyStatus] = useState<string | null>(null)

  // Load embeddings status, failures, and policies when modal opens
  useEffect(() => {
    if (!isOpen) return
    loadEmbeddingsStatus()
    loadFailures()
    loadPolicies()
  }, [isOpen, supabaseUrl, supabaseAnonKey])

  // Load policy details when a policy is selected
  useEffect(() => {
    if (selectedPolicy) {
      loadPolicyMetrics(selectedPolicy.id)
      loadPolicyAuditLogs(selectedPolicy.id)
    } else {
      setPolicyMetrics(null)
      setPolicyAuditLogs([])
    }
  }, [selectedPolicy, supabaseUrl, supabaseAnonKey])

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

  async function loadFailures() {
    if (!supabaseUrl || !supabaseAnonKey) {
      setFailuresError('Supabase credentials not configured')
      return
    }

    setLoadingFailures(true)
    setFailuresError(null)
    try {
      const res = await fetch('/api/failures/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: 100,
          orderBy: 'last_seen_at',
          orderDirection: 'desc',
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const data = (await res.json()) as {
        success: boolean
        failures: Failure[]
        error?: string
      }

      if (!data.success) {
        setFailuresError(data.error || 'Failed to load failures')
        return
      }

      setFailures(data.failures || [])
    } catch (err) {
      setFailuresError(err instanceof Error ? err.message : 'Failed to load failures')
    } finally {
      setLoadingFailures(false)
    }
  }

  function formatDate(dateString: string): string {
    try {
      const date = new Date(dateString)
      return date.toLocaleString()
    } catch {
      return dateString
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

  async function loadPolicies() {
    if (!supabaseUrl || !supabaseAnonKey) {
      setPoliciesError('Supabase credentials not configured')
      return
    }

    setLoadingPolicies(true)
    setPoliciesError(null)
    try {
      const res = await fetch('/api/policies/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const data = (await res.json()) as {
        success: boolean
        policies: Policy[]
        error?: string
      }

      if (!data.success) {
        setPoliciesError(data.error || 'Failed to load policies')
        return
      }

      setPolicies(data.policies || [])
    } catch (err) {
      setPoliciesError(err instanceof Error ? err.message : 'Failed to load policies')
    } finally {
      setLoadingPolicies(false)
    }
  }

  async function loadPolicyMetrics(policyId: string) {
    if (!supabaseUrl || !supabaseAnonKey) {
      return
    }

    setLoadingMetrics(true)
    try {
      const res = await fetch('/api/policies/get-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          policyId,
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const data = (await res.json()) as {
        success: boolean
        metrics: PolicyMetrics
        error?: string
      }

      if (data.success) {
        setPolicyMetrics(data.metrics)
      }
    } catch (err) {
      console.error('Failed to load policy metrics:', err)
    } finally {
      setLoadingMetrics(false)
    }
  }

  async function loadPolicyAuditLogs(policyId: string) {
    if (!supabaseUrl || !supabaseAnonKey) {
      return
    }

    setLoadingAuditLogs(true)
    try {
      const res = await fetch('/api/policies/get-audit-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          policyId,
          supabaseUrl,
          supabaseAnonKey,
          limit: 20,
        }),
      })

      const data = (await res.json()) as {
        success: boolean
        auditLogs: PolicyAuditLog[]
        error?: string
      }

      if (data.success) {
        setPolicyAuditLogs(data.auditLogs || [])
      }
    } catch (err) {
      console.error('Failed to load policy audit logs:', err)
    } finally {
      setLoadingAuditLogs(false)
    }
  }

  async function handlePolicyStatusUpdate(policyId: string, action: 'start_trial' | 'promote' | 'revert') {
    if (!supabaseUrl || !supabaseAnonKey) {
      alert('Supabase credentials not configured')
      return
    }

    setUpdatingPolicyStatus(policyId)
    try {
      const res = await fetch('/api/policies/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          policyId,
          action,
          actor: 'user',
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const data = (await res.json()) as {
        success: boolean
        policy: Policy
        error?: string
      }

      if (!data.success) {
        alert(data.error || 'Failed to update policy status')
        return
      }

      // Reload policies to get updated status
      await loadPolicies()
      // Update selected policy if it's the one we just updated
      if (selectedPolicy?.id === policyId) {
        setSelectedPolicy(data.policy)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update policy status')
    } finally {
      setUpdatingPolicyStatus(null)
    }
  }

  function getStatusBadgeColor(status: 'off' | 'trial' | 'promoted'): { background: string; color: string; border: string } {
    switch (status) {
      case 'off':
        return {
          background: 'rgba(108, 117, 125, 0.1)',
          color: 'var(--hal-text-muted)',
          border: '1px solid var(--hal-border)',
        }
      case 'trial':
        return {
          background: 'rgba(255, 193, 7, 0.1)',
          color: '#ffc107',
          border: '1px solid #ffc107',
        }
      case 'promoted':
        return {
          background: 'rgba(46, 125, 50, 0.1)',
          color: 'var(--hal-status-ok)',
          border: '1px solid var(--hal-status-ok)',
        }
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

          {/* Policies Section */}
          <section style={{ marginTop: '2rem' }}>
            <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 600 }}>Policies</h4>
            {loadingPolicies ? (
              <p style={{ color: 'var(--hal-text-muted)' }}>Loading policies...</p>
            ) : policiesError ? (
              <p style={{ color: 'var(--hal-status-error)' }}>Error: {policiesError}</p>
            ) : policies.length === 0 ? (
              <div style={{ padding: '1rem', border: '1px solid var(--hal-border)', borderRadius: '6px', background: 'var(--hal-surface-alt)' }}>
                <p style={{ margin: 0, color: 'var(--hal-text-muted)' }}>
                  No policies have been configured yet. Policies allow maintainers to safely trial, measure, and promote or revert changes to HAL process/rule behavior.
                </p>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {policies.map((policy) => {
                    const badgeStyle = getStatusBadgeColor(policy.status)
                    return (
                      <div
                        key={policy.id}
                        onClick={() => setSelectedPolicy(policy)}
                        style={{
                          cursor: 'pointer',
                          padding: '1rem',
                          border: '1px solid var(--hal-border)',
                          borderRadius: '6px',
                          background: selectedPolicy?.id === policy.id ? 'var(--hal-surface)' : 'var(--hal-surface-alt)',
                          transition: 'background 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          if (selectedPolicy?.id !== policy.id) {
                            e.currentTarget.style.background = 'var(--hal-surface)'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (selectedPolicy?.id !== policy.id) {
                            e.currentTarget.style.background = 'var(--hal-surface-alt)'
                          }
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                          <span style={{ fontWeight: 600, color: 'var(--hal-text)' }}>{policy.name}</span>
                          <div
                            style={{
                              display: 'inline-block',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.85rem',
                              fontWeight: 500,
                              ...badgeStyle,
                            }}
                          >
                            {policy.status === 'off' ? 'Off' : policy.status === 'trial' ? 'Trial' : 'Promoted'}
                          </div>
                        </div>
                        <p style={{ margin: '0.5rem 0', color: 'var(--hal-text)', fontSize: '0.9rem' }}>{policy.description}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </section>

          {/* Failures Library Section */}
          <section style={{ marginTop: '2rem' }}>
            <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 600 }}>Failures</h4>
            {loadingFailures ? (
              <p style={{ color: 'var(--hal-text-muted)' }}>Loading failures...</p>
            ) : failuresError ? (
              <p style={{ color: 'var(--hal-status-error)' }}>Error: {failuresError}</p>
            ) : failures.length === 0 ? (
              <div style={{ padding: '1rem', border: '1px solid var(--hal-border)', borderRadius: '6px', background: 'var(--hal-surface-alt)' }}>
                <p style={{ margin: 0, color: 'var(--hal-text-muted)' }}>
                  No failures have been recorded yet. Failures are automatically recorded when drift attempts or agent outcomes fail.
                </p>
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--hal-text-muted)' }}>
                  {failures.length} failure{failures.length !== 1 ? 's' : ''} recorded
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '0.9rem',
                    }}
                  >
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--hal-border)' }}>
                        <th style={{ padding: '0.5rem', textAlign: 'left', fontWeight: 600 }}>Type</th>
                        <th style={{ padding: '0.5rem', textAlign: 'left', fontWeight: 600 }}>Recurrences</th>
                        <th style={{ padding: '0.5rem', textAlign: 'left', fontWeight: 600 }}>First Seen</th>
                        <th style={{ padding: '0.5rem', textAlign: 'left', fontWeight: 600 }}>Last Seen</th>
                        <th style={{ padding: '0.5rem', textAlign: 'left', fontWeight: 600 }}>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {failures.map((failure) => (
                        <tr
                          key={failure.id}
                          onClick={() => setSelectedFailure(failure)}
                          style={{
                            cursor: 'pointer',
                            borderBottom: '1px solid var(--hal-border)',
                            transition: 'background 0.2s',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--hal-surface)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent'
                          }}
                        >
                          <td style={{ padding: '0.5rem' }}>{failure.failure_type}</td>
                          <td style={{ padding: '0.5rem' }}>
                            {failure.recurrence_count > 1 ? (
                              <span style={{ color: 'var(--hal-status-error)', fontWeight: 600 }}>{failure.recurrence_count}</span>
                            ) : (
                              '1'
                            )}
                          </td>
                          <td style={{ padding: '0.5rem', color: 'var(--hal-text-muted)', fontSize: '0.85rem' }}>
                            {formatDate(failure.first_seen_at)}
                          </td>
                          <td style={{ padding: '0.5rem', color: 'var(--hal-text-muted)', fontSize: '0.85rem' }}>
                            {formatDate(failure.last_seen_at)}
                          </td>
                          <td style={{ padding: '0.5rem', fontSize: '0.85rem', color: 'var(--hal-text-muted)' }}>
                            {failure.source_type === 'drift_attempt' ? 'Drift' : 'Agent'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Policy Details Modal */}
      {selectedPolicy && (
        <div
          className="conversation-modal-overlay"
          onClick={() => setSelectedPolicy(null)}
          style={{ zIndex: 10001 }}
        >
          <div
            className="conversation-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '80vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
          >
            <div className="conversation-modal-header">
              <h3>{selectedPolicy.name}</h3>
              <button
                type="button"
                className="conversation-modal-close btn-destructive"
                onClick={() => setSelectedPolicy(null)}
                aria-label="Close policy details"
              >
                ×
              </button>
            </div>

            <div className="conversation-modal-content" style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
              {/* Policy Info */}
              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 600 }}>Description</h4>
                <p style={{ margin: 0, color: 'var(--hal-text)' }}>{selectedPolicy.description}</p>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 600 }}>Status</h4>
                <div
                  style={{
                    display: 'inline-block',
                    padding: '0.4rem 0.8rem',
                    borderRadius: '4px',
                    fontWeight: 500,
                    ...getStatusBadgeColor(selectedPolicy.status),
                  }}
                >
                  {selectedPolicy.status === 'off' ? 'Off' : selectedPolicy.status === 'trial' ? 'Trial' : 'Promoted'}
                </div>
                <p style={{ margin: '0.5rem 0 0 0', color: 'var(--hal-text-muted)', fontSize: '0.9rem' }}>
                  Last changed: {formatDate(selectedPolicy.last_changed_at)}
                </p>
              </div>

              {/* Action Buttons */}
              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 600 }}>Actions</h4>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {selectedPolicy.status === 'off' && (
                    <button
                      type="button"
                      className="btn-standard"
                      onClick={() => handlePolicyStatusUpdate(selectedPolicy.id, 'start_trial')}
                      disabled={updatingPolicyStatus === selectedPolicy.id}
                    >
                      {updatingPolicyStatus === selectedPolicy.id ? 'Starting...' : 'Start trial'}
                    </button>
                  )}
                  {selectedPolicy.status === 'trial' && (
                    <>
                      <button
                        type="button"
                        className="btn-standard"
                        onClick={() => handlePolicyStatusUpdate(selectedPolicy.id, 'promote')}
                        disabled={updatingPolicyStatus === selectedPolicy.id}
                        style={{ background: 'var(--hal-status-ok)', color: 'white' }}
                      >
                        {updatingPolicyStatus === selectedPolicy.id ? 'Promoting...' : 'Promote'}
                      </button>
                      <button
                        type="button"
                        className="btn-destructive"
                        onClick={() => handlePolicyStatusUpdate(selectedPolicy.id, 'revert')}
                        disabled={updatingPolicyStatus === selectedPolicy.id}
                      >
                        {updatingPolicyStatus === selectedPolicy.id ? 'Reverting...' : 'Revert'}
                      </button>
                    </>
                  )}
                  {selectedPolicy.status === 'promoted' && (
                    <button
                      type="button"
                      className="btn-destructive"
                      onClick={() => handlePolicyStatusUpdate(selectedPolicy.id, 'revert')}
                      disabled={updatingPolicyStatus === selectedPolicy.id}
                    >
                      {updatingPolicyStatus === selectedPolicy.id ? 'Reverting...' : 'Revert'}
                    </button>
                  )}
                </div>
              </div>

              {/* Metrics Section */}
              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 600 }}>Metrics</h4>
                {loadingMetrics ? (
                  <p style={{ color: 'var(--hal-text-muted)' }}>Loading metrics...</p>
                ) : policyMetrics ? (
                  <div style={{ padding: '1rem', border: '1px solid var(--hal-border)', borderRadius: '6px', background: 'var(--hal-surface-alt)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                      <div>
                        <p style={{ margin: '0 0 0.25rem 0', color: 'var(--hal-text-muted)', fontSize: '0.9rem' }}>Events in baseline window</p>
                        <p style={{ margin: 0, color: 'var(--hal-text)', fontSize: '1.25rem', fontWeight: 600 }}>
                          {policyMetrics.baseline_event_count}
                        </p>
                      </div>
                      <div>
                        <p style={{ margin: '0 0 0.25rem 0', color: 'var(--hal-text-muted)', fontSize: '0.9rem' }}>Events in trial window</p>
                        <p style={{ margin: 0, color: 'var(--hal-text)', fontSize: '1.25rem', fontWeight: 600 }}>
                          {policyMetrics.trial_event_count}
                        </p>
                      </div>
                    </div>
                    {policyMetrics.baseline_window_start && (
                      <p style={{ margin: '0.5rem 0 0 0', color: 'var(--hal-text-muted)', fontSize: '0.85rem' }}>
                        Baseline: {formatDate(policyMetrics.baseline_window_start)} -{' '}
                        {policyMetrics.baseline_window_end ? formatDate(policyMetrics.baseline_window_end) : 'ongoing'}
                      </p>
                    )}
                    {policyMetrics.trial_window_start && (
                      <p style={{ margin: '0.5rem 0 0 0', color: 'var(--hal-text-muted)', fontSize: '0.85rem' }}>
                        Trial: {formatDate(policyMetrics.trial_window_start)} -{' '}
                        {policyMetrics.trial_window_end ? formatDate(policyMetrics.trial_window_end) : 'ongoing'}
                      </p>
                    )}
                  </div>
                ) : (
                  <div style={{ padding: '1rem', border: '1px solid var(--hal-border)', borderRadius: '6px', background: 'var(--hal-surface-alt)' }}>
                    <p style={{ margin: 0, color: 'var(--hal-text-muted)' }}>No metrics available yet.</p>
                  </div>
                )}
              </div>

              {/* Audit Log Section */}
              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 600 }}>Audit Log</h4>
                {loadingAuditLogs ? (
                  <p style={{ color: 'var(--hal-text-muted)' }}>Loading audit log...</p>
                ) : policyAuditLogs.length === 0 ? (
                  <div style={{ padding: '1rem', border: '1px solid var(--hal-border)', borderRadius: '6px', background: 'var(--hal-surface-alt)' }}>
                    <p style={{ margin: 0, color: 'var(--hal-text-muted)' }}>No audit log entries yet.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {policyAuditLogs.map((log) => (
                      <div
                        key={log.id}
                        style={{
                          padding: '0.75rem',
                          border: '1px solid var(--hal-border)',
                          borderRadius: '4px',
                          background: 'var(--hal-surface-alt)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.25rem' }}>
                          <span style={{ fontWeight: 600, color: 'var(--hal-text)' }}>
                            {log.action === 'start_trial' ? 'Start Trial' : log.action === 'promote' ? 'Promote' : 'Revert'}
                          </span>
                          <span style={{ color: 'var(--hal-text-muted)', fontSize: '0.85rem' }}>{formatDate(log.created_at)}</span>
                        </div>
                        <p style={{ margin: '0.25rem 0', color: 'var(--hal-text)', fontSize: '0.9rem' }}>
                          {log.from_status} → {log.to_status}
                        </p>
                        {log.actor && (
                          <p style={{ margin: '0.25rem 0 0 0', color: 'var(--hal-text-muted)', fontSize: '0.85rem' }}>
                            Actor: {log.actor}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Failure Details Modal */}
      {selectedFailure && (
        <div
          className="conversation-modal-overlay"
          onClick={() => setSelectedFailure(null)}
          style={{ zIndex: 10001 }}
        >
          <div
            className="conversation-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '80vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
          >
            <div className="conversation-modal-header">
              <h3>Failure Details</h3>
              <button
                type="button"
                className="conversation-modal-close btn-destructive"
                onClick={() => setSelectedFailure(null)}
                aria-label="Close failure details"
              >
                ×
              </button>
            </div>

            <div className="conversation-modal-content" style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 600 }}>Failure Type</h4>
                <p style={{ margin: 0, color: 'var(--hal-text)' }}>{selectedFailure.failure_type}</p>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 600 }}>Recurrence Information</h4>
                <p style={{ margin: '0.25rem 0', color: 'var(--hal-text)' }}>
                  <strong>Count:</strong> {selectedFailure.recurrence_count} occurrence{selectedFailure.recurrence_count !== 1 ? 's' : ''}
                </p>
                <p style={{ margin: '0.25rem 0', color: 'var(--hal-text)' }}>
                  <strong>First Seen:</strong> {formatDate(selectedFailure.first_seen_at)}
                </p>
                <p style={{ margin: '0.25rem 0', color: 'var(--hal-text)' }}>
                  <strong>Last Seen:</strong> {formatDate(selectedFailure.last_seen_at)}
                </p>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 600 }}>Root Cause</h4>
                {selectedFailure.root_cause ? (
                  <div
                    style={{
                      padding: '0.75rem',
                      background: 'var(--hal-surface-alt)',
                      borderRadius: '4px',
                      whiteSpace: 'pre-wrap',
                      color: 'var(--hal-text)',
                    }}
                  >
                    {selectedFailure.root_cause}
                  </div>
                ) : (
                  <p style={{ margin: 0, color: 'var(--hal-text-muted)', fontStyle: 'italic' }}>No root cause recorded</p>
                )}
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 600 }}>Prevention Candidate</h4>
                {selectedFailure.prevention_candidate ? (
                  <div
                    style={{
                      padding: '0.75rem',
                      background: 'var(--hal-surface-alt)',
                      borderRadius: '4px',
                      whiteSpace: 'pre-wrap',
                      color: 'var(--hal-text)',
                    }}
                  >
                    {selectedFailure.prevention_candidate}
                  </div>
                ) : (
                  <p style={{ margin: 0, color: 'var(--hal-text-muted)', fontStyle: 'italic' }}>No prevention candidate recorded</p>
                )}
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 600 }}>Source</h4>
                <p style={{ margin: '0.25rem 0', color: 'var(--hal-text)' }}>
                  <strong>Type:</strong> {selectedFailure.source_type === 'drift_attempt' ? 'Drift Attempt' : 'Agent Outcome'}
                </p>
                {selectedFailure.metadata?.agentType && (
                  <p style={{ margin: '0.25rem 0', color: 'var(--hal-text)' }}>
                    <strong>Agent Type:</strong> {selectedFailure.metadata.agentType}
                  </p>
                )}
                {selectedFailure.metadata?.transition && (
                  <p style={{ margin: '0.25rem 0', color: 'var(--hal-text)' }}>
                    <strong>Transition:</strong> {selectedFailure.metadata.transition}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
