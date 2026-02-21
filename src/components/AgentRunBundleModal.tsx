import { useState, useEffect } from 'react'
import { AgentRunContextBundleBuilder } from './AgentRunContextBundleBuilder'

interface AgentRunBundleModalProps {
  isOpen: boolean
  onClose: () => void
  runId: string | null
  supabaseUrl: string | null
  supabaseAnonKey: string | null
}

interface AgentRun {
  run_id: string
  agent_type: string
  status: string
  current_stage: string | null
  ticket_pk: string | null
  ticket_number: number | null
  display_id: string | null
  repo_full_name: string
  created_at: string
  updated_at: string
  finished_at: string | null
  summary: string | null
  error: string | null
}

interface Ticket {
  pk: string
  id: string
  display_id: string | null
}

export function AgentRunBundleModal({
  isOpen,
  onClose,
  runId: initialRunId,
  supabaseUrl,
  supabaseAnonKey,
}: AgentRunBundleModalProps) {
  const [runId, setRunId] = useState<string>(initialRunId || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [agentRun, setAgentRun] = useState<AgentRun | null>(null)
  const [ticket, setTicket] = useState<Ticket | null>(null)

  useEffect(() => {
    if (initialRunId) {
      setRunId(initialRunId)
    }
  }, [initialRunId])

  useEffect(() => {
    if (isOpen && runId && supabaseUrl && supabaseAnonKey) {
      loadAgentRun()
    } else {
      setAgentRun(null)
      setTicket(null)
      setError(null)
    }
  }, [isOpen, runId, supabaseUrl, supabaseAnonKey])

  const loadAgentRun = async () => {
    if (!runId || !supabaseUrl || !supabaseAnonKey) return

    setLoading(true)
    setError(null)

    try {
      // Fetch agent run status
      const statusRes = await fetch(`/api/agent-runs/status?runId=${encodeURIComponent(runId)}`, {
        credentials: 'include',
      })

      if (!statusRes.ok) {
        throw new Error('Failed to fetch agent run status')
      }

      const statusData = (await statusRes.json()) as { run?: AgentRun }
      if (!statusData.run) {
        throw new Error('Agent run not found')
      }

      setAgentRun(statusData.run)

      // If we have ticket_pk, fetch ticket details
      if (statusData.run.ticket_pk) {
        const { createClient } = await import('@supabase/supabase-js')
        const supabase = createClient(supabaseUrl, supabaseAnonKey)
        const { data: ticketData, error: ticketError } = await supabase
          .from('tickets')
          .select('pk, id, display_id')
          .eq('pk', statusData.run.ticket_pk)
          .maybeSingle()

        if (!ticketError && ticketData) {
          setTicket({
            pk: ticketData.pk,
            id: ticketData.id,
            display_id: ticketData.display_id,
          })
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agent run')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '900px', maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Build Context Bundle from Agent Run</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'auto' }}>
          {/* Run ID Input */}
          <div style={{ border: '1px solid var(--hal-border)', borderRadius: '8px', padding: '16px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '18px' }}>Agent Run ID</h3>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                value={runId}
                onChange={(e) => setRunId(e.target.value)}
                placeholder="Enter agent run ID (UUID)"
                style={{ flex: 1, padding: '8px', fontSize: '14px', fontFamily: 'monospace' }}
              />
              <button
                type="button"
                className="btn-standard"
                onClick={loadAgentRun}
                disabled={loading || !runId.trim() || !supabaseUrl || !supabaseAnonKey}
              >
                {loading ? 'Loading...' : 'Load Run'}
              </button>
            </div>
            {!supabaseUrl || !supabaseAnonKey ? (
              <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: 'var(--hal-text-muted)' }}>
                Supabase connection required to load agent runs.
              </p>
            ) : null}
          </div>

          {error && (
            <div style={{ padding: '12px', background: 'var(--hal-status-error, #c62828)', color: 'white', borderRadius: '4px' }}>
              <strong>Error:</strong> {error}
            </div>
          )}

          {loading && <p>Loading agent run...</p>}

          {!loading && !error && agentRun && (
            <>
              <div style={{ padding: '12px', background: 'var(--hal-surface-alt)', borderRadius: '4px' }}>
                <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Agent Run Details</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                  <div>
                    <strong>Run ID:</strong> {agentRun.run_id.substring(0, 8)}...
                  </div>
                  <div>
                    <strong>Agent Type:</strong> {agentRun.agent_type}
                  </div>
                  <div>
                    <strong>Status:</strong> {agentRun.status}
                  </div>
                  {agentRun.current_stage && (
                    <div>
                      <strong>Current Stage:</strong> {agentRun.current_stage}
                    </div>
                  )}
                  {ticket && (
                    <div>
                      <strong>Ticket:</strong> {ticket.display_id || ticket.id}
                    </div>
                  )}
                  <div>
                    <strong>Repository:</strong> {agentRun.repo_full_name}
                  </div>
                  <div>
                    <strong>Created:</strong> {new Date(agentRun.created_at).toLocaleString()}
                  </div>
                </div>
              </div>

              {agentRun.ticket_pk && agentRun.repo_full_name ? (
                <AgentRunContextBundleBuilder
                  runId={agentRun.run_id}
                  ticketPk={agentRun.ticket_pk}
                  ticketId={ticket?.id || null}
                  repoFullName={agentRun.repo_full_name}
                  supabaseUrl={supabaseUrl}
                  supabaseAnonKey={supabaseAnonKey}
                  onBundleCreated={(bundleId) => {
                    // Optionally refresh or show success message
                    console.log('Bundle created:', bundleId)
                  }}
                />
              ) : (
                <div style={{ padding: '12px', background: 'var(--hal-surface-alt)', borderRadius: '4px', color: 'var(--hal-text-muted)' }}>
                  This agent run does not have ticket and repository information required to build a context bundle.
                </div>
              )}
            </>
          )}

          {!loading && !error && !agentRun && (
            <div style={{ padding: '12px', background: 'var(--hal-surface-alt)', borderRadius: '4px', color: 'var(--hal-text-muted)' }}>
              No agent run selected. Please provide a valid run ID.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
