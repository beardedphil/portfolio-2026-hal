import React, { useState, useEffect, useContext } from 'react'
import { createClient } from '@supabase/supabase-js'
import { HalKanbanContext } from '../HalKanbanContext'
import type { SupabaseAgentArtifactRow } from './types'

export function ProcessReviewSection({
  ticketId,
  ticketPk,
  artifacts: _artifacts, // Unused: artifacts are only shown in artifacts panel (0148)
  supabaseUrl,
  supabaseAnonKey,
}: {
  ticketId: string
  ticketPk: string
  artifacts: SupabaseAgentArtifactRow[]
  supabaseUrl?: string
  supabaseAnonKey?: string
}) {
  const halCtx = useContext(HalKanbanContext)
  const [suggestions, setSuggestions] = useState<Array<{ id: string; text: string; justification: string; selected: boolean }>>([])
  const [lastRunStatus, setLastRunStatus] = useState<{ timestamp: string; success: boolean; error?: string } | null>(null)
  const [isCreatingTicket, setIsCreatingTicket] = useState(false)
  const [createdTicketId, setCreatedTicketId] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  
  // Check if Process Review is currently running for this ticket (from column header button)
  const isRunningReview = halCtx?.processReviewRunningForTicketPk === ticketPk

  // Load last run status from database on mount and when review completes
  const loadLastRunStatus = React.useCallback(async () => {
    if (!supabaseUrl || !supabaseAnonKey || !ticketPk) return

    try {
      const supabase = createClient(supabaseUrl, supabaseAnonKey)
      const { data, error } = await supabase
        .from('process_reviews')
        .select('created_at, status, error_message, suggestions')
        .eq('ticket_pk', ticketPk)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        console.error('Failed to load process review status:', error)
        return
      }

      if (data) {
        setLastRunStatus({
          timestamp: data.created_at,
          success: data.status === 'success',
          error: data.error_message || undefined,
        })

        // Load suggestions if available
        if (data.suggestions && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
          const loadedSuggestions = data.suggestions.map((s: string | { text: string; justification?: string }, i: number) => {
            if (typeof s === 'string') {
              return {
                id: `suggestion-${i}`,
                text: s,
                justification: 'No justification provided.',
                selected: false,
              }
            } else {
              return {
                id: `suggestion-${i}`,
                text: s.text || '',
                justification: s.justification || 'No justification provided.',
                selected: false,
              }
            }
          })
          setSuggestions(loadedSuggestions)
        } else {
          // Clear suggestions if no data
          setSuggestions([])
        }
      } else {
        // No review data found
        setLastRunStatus(null)
        setSuggestions([])
      }
    } catch (err) {
      console.error('Error loading process review status:', err)
    }
  }, [supabaseUrl, supabaseAnonKey, ticketPk])

  // Load on mount and when ticketPk changes
  useEffect(() => {
    loadLastRunStatus()
  }, [loadLastRunStatus])

  // Refresh when review completes (isRunningReview changes from true to false)
  const prevIsRunningReview = React.useRef(isRunningReview)
  useEffect(() => {
    if (prevIsRunningReview.current && !isRunningReview) {
      // Review just completed, refresh data
      loadLastRunStatus()
    }
    prevIsRunningReview.current = isRunningReview
  }, [isRunningReview, loadLastRunStatus])

  const handleToggleSuggestion = (id: string) => {
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, selected: !s.selected } : s))
    )
  }

  const handleCreateTicket = async () => {
    const selectedSuggestions = suggestions.filter((s) => s.selected)
    if (selectedSuggestions.length === 0) {
      setCreateError('Please select at least one suggestion')
      return
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      setCreateError('Supabase not configured. Connect to Supabase to create ticket.')
      return
    }

    setIsCreatingTicket(true)
    setCreateError(null)
    setCreatedTicketId(null)

    try {
      const response = await fetch('/api/tickets/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceTicketId: ticketId,
          sourceTicketPk: ticketPk,
          suggestions: selectedSuggestions.map((s) => s.text),
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const result = await response.json()

      if (!result.success) {
        setCreateError(result.error || 'Failed to create ticket')
        return
      }

      setCreatedTicketId(result.ticketId || result.id || 'Unknown')
      // Clear selections after successful creation
      setSuggestions((prev) => prev.map((s) => ({ ...s, selected: false })))
      
      // Immediately refresh tickets to show the new ticket (0133)
      if (halCtx?.onTicketCreated) {
        // Library mode: HAL provides callback to refresh its data
        try {
          await halCtx.onTicketCreated()
        } catch (err) {
          console.warn('[Kanban] Failed to refresh tickets after creation:', err)
          // Non-blocking: continue normal polling
        }
      } else if (typeof window !== 'undefined' && window.parent !== window.self) {
        // Embedded iframe mode: notify parent via postMessage
        try {
          window.parent.postMessage({ type: 'HAL_TICKET_CREATED' }, '*')
        } catch (err) {
          console.warn('[Kanban] Failed to notify parent of ticket creation:', err)
        }
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create ticket')
    } finally {
      setIsCreatingTicket(false)
    }
  }

  return (
    <div className="process-review-section">
      <h3 className="process-review-title">Process Review</h3>
      
      {/* Artifacts removed from ProcessReviewSection (0148): artifacts are only shown in the artifacts panel */}

      {isRunningReview && (
        <div className="process-review-last-run" role="status">
          <p>
            <strong>Status:</strong>{' '}
            <span className="process-review-status-running">⏳ Process Review in progress...</span>
          </p>
        </div>
      )}

      {!isRunningReview && lastRunStatus && (
        <div className="process-review-last-run" role="status">
          <p>
            <strong>Last run:</strong>{' '}
            {new Date(lastRunStatus.timestamp).toLocaleString()}{' '}
            {lastRunStatus.success ? (
              <span className="process-review-status-success">✓ Success</span>
            ) : (
              <span className="process-review-status-failed">✗ Failed</span>
            )}
            {lastRunStatus.error && (
              <span className="process-review-error-detail"> — {lastRunStatus.error}</span>
            )}
          </p>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="process-review-suggestions">
          <h4 className="process-review-subtitle">Suggested improvements</h4>
          <ul className="process-review-suggestions-list">
            {suggestions.map((suggestion) => (
              <li key={suggestion.id} className="process-review-suggestion-item">
                <label className="process-review-suggestion-label">
                  <input
                    type="checkbox"
                    checked={suggestion.selected}
                    onChange={() => handleToggleSuggestion(suggestion.id)}
                    disabled={isCreatingTicket}
                  />
                  <div className="process-review-suggestion-content">
                    <span className="process-review-suggestion-text">{suggestion.text}</span>
                    {suggestion.justification && (
                      <span className="process-review-suggestion-justification">{suggestion.justification}</span>
                    )}
                  </div>
                </label>
              </li>
            ))}
          </ul>
          <div className="process-review-create-actions">
            <button
              type="button"
              className="process-review-button process-review-button-create"
              onClick={handleCreateTicket}
              disabled={isCreatingTicket || suggestions.filter((s) => s.selected).length === 0}
            >
              {isCreatingTicket ? 'Creating ticket...' : 'Create ticket'}
            </button>
          </div>
        </div>
      )}

      {createError && (
        <div className="process-review-error" role="alert">
          <p>{createError}</p>
        </div>
      )}

      {createdTicketId && (
        <div className="process-review-success" role="alert">
          <p>
            <strong>Ticket created:</strong> {createdTicketId}
          </p>
        </div>
      )}
    </div>
  )
}
