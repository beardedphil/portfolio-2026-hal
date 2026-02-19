import React, { useState, useCallback, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { parseFrontmatter } from '../frontmatter'
import { stripQAInformationBlockFromBody } from '../lib/ticketBody'
import { extractPriority } from './utils'
import type { SupabaseAgentArtifactRow, TicketAttachment } from './types'
import { ArtifactsSection } from './ArtifactsSection'
import { AttachmentsSection } from './AttachmentsSection'
import { ProcessReviewSection } from './ProcessReviewSection'
import { HumanValidationSection } from './HumanValidationSection'
import { AutoDismissMessage } from './AutoDismissMessage'
import { PullRequestSection } from './PullRequestSection'

/** Ticket detail modal (0033): title, metadata, markdown body, close/escape/backdrop, scroll lock, focus trap */
export function TicketDetailModal({
  open,
  onClose,
  ticketId,
  title,
  body,
  loading,
  error,
  onRetry,
  artifacts,
  artifactsLoading,
  artifactsStatus = null,
  onRefreshArtifacts = undefined,
  onOpenArtifact,
  columnId,
  onValidationPass,
  onValidationFail,
  supabaseUrl,
  supabaseKey,
  onTicketUpdate: _onTicketUpdate,
  attachments,
  attachmentsLoading,
  failureCounts,
  repoFullName,
}: {
  open: boolean
  onClose: () => void
  ticketId: string
  title: string
  body: string | null
  loading: boolean
  error: string | null
  onRetry?: () => void
  artifacts: SupabaseAgentArtifactRow[]
  artifactsLoading: boolean
  artifactsStatus?: string | null
  onRefreshArtifacts?: () => void
  onOpenArtifact: (artifact: SupabaseAgentArtifactRow) => void
  columnId: string | null
  onValidationPass: (ticketPk: string) => Promise<void>
  onValidationFail: (ticketPk: string, steps: string, notes: string) => Promise<void>
  supabaseUrl: string
  supabaseKey: string
  onTicketUpdate: () => void
  attachments: TicketAttachment[]
  attachmentsLoading: boolean
  failureCounts?: { qa: number; hitl: number } | null
  repoFullName?: string | null
}) {
  const [validationSteps, setValidationSteps] = useState('')
  const [validationNotes, setValidationNotes] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [validationSuccess, setValidationSuccess] = useState<string | null>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  // Scroll lock when open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Focus first focusable (close button) when open; focus trap
  useEffect(() => {
    if (!open || !modalRef.current) return
    const el = closeBtnRef.current ?? modalRef.current.querySelector<HTMLElement>('button, [href], input, select, textarea')
    el?.focus()
  }, [open])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !modalRef.current) return
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      const list = Array.from(focusable)
      const first = list[0]
      const last = list[list.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last?.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first?.focus()
        }
      }
    },
    [onClose]
  )

  const handlePass = useCallback(async () => {
    if (!ticketId || isProcessing) return
    
    // Clear previous messages
    setValidationError(null)
    setValidationSuccess(null)
    
    setIsProcessing(true)
    try {
      await onValidationPass(ticketId)
      // Success message
      setValidationSuccess('Ticket passed successfully. Moving to Process Review...')
      setValidationSteps('')
      setValidationNotes('')
      
      // Refresh ticket body to show the updated state
      if (_onTicketUpdate) {
        // Small delay to allow Supabase update to complete
        setTimeout(() => {
          _onTicketUpdate()
        }, 500)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setValidationError(`Failed to pass ticket: ${errorMessage}`)
      console.error('Failed to pass validation:', err)
    } finally {
      setIsProcessing(false)
    }
  }, [ticketId, isProcessing, onValidationPass, _onTicketUpdate])

  const handleFail = useCallback(async () => {
    if (!ticketId || isProcessing) return
    
    // Clear previous messages
    setValidationError(null)
    setValidationSuccess(null)
    
    // Validate that explanation is provided
    if (!validationSteps.trim() && !validationNotes.trim()) {
      setValidationError('Please provide an explanation (steps to validate or notes) before failing the ticket.')
      return
    }
    
    setIsProcessing(true)
    try {
      await onValidationFail(ticketId, validationSteps, validationNotes)
      // Success message will be set based on whether QA artifact was created
      setValidationSuccess(columnId === 'col-human-in-the-loop' 
        ? 'Ticket failed. QA artifact created with FAIL verdict. Moving to To Do...'
        : 'Ticket failed successfully. Moving to To Do...')
      setValidationSteps('')
      setValidationNotes('')
      
      // Refresh ticket body to show the updated feedback
      if (_onTicketUpdate) {
        // Small delay to allow Supabase update to complete
        setTimeout(() => {
          _onTicketUpdate()
        }, 500)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setValidationError(`Failed to fail ticket: ${errorMessage}`)
      console.error('Failed to fail validation:', err)
    } finally {
      setIsProcessing(false)
    }
  }, [ticketId, validationSteps, validationNotes, isProcessing, onValidationFail, _onTicketUpdate, columnId])

  // Reset validation fields when modal closes
  useEffect(() => {
    if (!open) {
      setValidationSteps('')
      setValidationNotes('')
      setIsProcessing(false)
      setValidationError(null)
      setValidationSuccess(null)
    }
  }, [open])

  if (!open) return null

  const { frontmatter, body: bodyOnly } = body ? parseFrontmatter(body) : { frontmatter: {}, body: '' }
  const priority = body ? extractPriority(frontmatter, body) : null
  const markdownBody = body ? stripQAInformationBlockFromBody(bodyOnly) : ''
  const showValidationSection = columnId === 'col-human-in-the-loop'
  const showProcessReviewSection = columnId === 'col-process-review'

  return (
    <div
      className="ticket-detail-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ticket-detail-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={handleKeyDown}
    >
      <div className="ticket-detail-modal" ref={modalRef}>
        <div className="ticket-detail-header">
          <h2 id="ticket-detail-title" className="ticket-detail-title">
            {title}
          </h2>
          <button
            type="button"
            className="ticket-detail-close"
            onClick={onClose}
            ref={closeBtnRef}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="ticket-detail-meta">
          <span className="ticket-detail-id">ID: {ticketId}</span>
          {priority != null && <span className="ticket-detail-priority">Priority: {priority}</span>}
          {failureCounts && (
            <>
              {failureCounts.qa > 0 && (
                <span className="ticket-detail-failure-count" style={{ color: failureCounts.qa >= 3 ? '#d32f2f' : '#f57c00' }}>
                  QA fails: {failureCounts.qa}
                </span>
              )}
              {failureCounts.hitl > 0 && (
                <span className="ticket-detail-failure-count" style={{ color: failureCounts.hitl >= 3 ? '#d32f2f' : '#f57c00' }}>
                  HITL fails: {failureCounts.hitl}
                </span>
              )}
            </>
          )}
        </div>
        <div className="ticket-detail-body-wrap">
          {loading && <p className="ticket-detail-loading">Loading…</p>}
          {error && (
            <div className="ticket-detail-error" role="alert">
              <p>{error}</p>
              <div className="ticket-detail-error-actions">
                {onRetry && (
                  <button type="button" onClick={onRetry}>
                    Retry
                  </button>
                )}
                <button type="button" onClick={onClose}>
                  Close
                </button>
              </div>
            </div>
          )}
          {!loading && !error && (
            <>
              <div 
                className="ticket-detail-body"
                data-has-human-feedback={markdownBody?.includes('## ⚠️ Human Feedback') ? 'true' : undefined}
              >
                {markdownBody ? (
                  <ReactMarkdown>{markdownBody}</ReactMarkdown>
                ) : (
                  <p className="ticket-detail-empty">No content.</p>
                )}
              </div>
              <ArtifactsSection
                artifacts={artifacts}
                loading={artifactsLoading}
                onOpenArtifact={onOpenArtifact}
                statusMessage={artifactsStatus}
                onRefresh={onRefreshArtifacts}
                refreshing={false}
                columnId={columnId}
              />
              <AttachmentsSection
                attachments={attachments}
                loading={attachmentsLoading}
              />
              <PullRequestSection
                ticketId={ticketId}
                ticketPk={ticketId}
                repoFullName={repoFullName || null}
                supabaseUrl={supabaseUrl}
                supabaseKey={supabaseKey}
                onRefresh={_onTicketUpdate}
              />
              {showValidationSection && (
                <>
                  {validationError && (
                    <div className="ticket-detail-error" role="alert" style={{ marginBottom: '1rem' }}>
                      <p>{validationError}</p>
                    </div>
                  )}
                  {validationSuccess && (
                    <>
                      <div className="success-message" role="status" style={{ marginBottom: '1rem' }}>
                        <p>{validationSuccess}</p>
                      </div>
                      <AutoDismissMessage
                        onDismiss={() => setValidationSuccess(null)}
                        delay={3000}
                      />
                    </>
                  )}
                  <HumanValidationSection
                    ticketId={ticketId}
                    ticketPk={ticketId}
                    stepsToValidate={validationSteps}
                    notes={validationNotes}
                    onStepsChange={(value) => {
                      setValidationSteps(value)
                      // Clear error when user starts typing
                      if (validationError) setValidationError(null)
                    }}
                    onNotesChange={(value) => {
                      setValidationNotes(value)
                      // Clear error when user starts typing
                      if (validationError) setValidationError(null)
                    }}
                    onPass={handlePass}
                    onFail={handleFail}
                    isProcessing={isProcessing}
                  />
                </>
              )}
              {showProcessReviewSection && (
                <ProcessReviewSection
                  ticketId={ticketId}
                  ticketPk={ticketId}
                  artifacts={artifacts}
                  supabaseUrl={supabaseUrl}
                  supabaseAnonKey={supabaseKey}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
