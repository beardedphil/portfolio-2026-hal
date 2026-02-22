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

// Helper: Get focusable elements within a container
function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  return Array.from(container.querySelectorAll<HTMLElement>(selector))
}

// Helper: Handle focus trap for Tab key navigation
function handleFocusTrap(e: React.KeyboardEvent, container: HTMLElement | null) {
  if (e.key !== 'Tab' || !container) return false
  
  const focusable = getFocusableElements(container)
  if (focusable.length === 0) return false
  
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const activeElement = document.activeElement
  
  if (e.shiftKey && activeElement === first) {
    e.preventDefault()
    last.focus()
    return true
  }
  
  if (!e.shiftKey && activeElement === last) {
    e.preventDefault()
    first.focus()
    return true
  }
  
  return false
}

// Helper: Get failure count color based on count
function getFailureCountColor(count: number): string {
  return count >= 3 ? '#d32f2f' : '#f57c00'
}

// Helper: Get validation success message based on column
function getValidationSuccessMessage(columnId: string | null, isPass: boolean): string {
  if (isPass) {
    return 'Ticket passed successfully. Moving to Process Review...'
  }
  return columnId === 'col-human-in-the-loop'
    ? 'Ticket failed. QA artifact created with FAIL verdict. Moving to To Do...'
    : 'Ticket failed successfully. Moving to To Do...'
}

// Helper: Clear validation state
function clearValidationState(
  setValidationSteps: (value: string) => void,
  setValidationNotes: (value: string) => void,
  setValidationError: (value: string | null) => void,
  setValidationSuccess: (value: string | null) => void
) {
  setValidationSteps('')
  setValidationNotes('')
  setValidationError(null)
  setValidationSuccess(null)
}

// Helper: Refresh ticket after validation
function refreshTicketAfterDelay(onTicketUpdate: (() => void) | undefined) {
  if (!onTicketUpdate) return
  setTimeout(() => {
    onTicketUpdate()
  }, 500)
}

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

  // Focus first focusable (close button) when open
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
      handleFocusTrap(e, modalRef.current)
    },
    [onClose]
  )

  const handleValidationAction = useCallback(
    async (
      action: () => Promise<void>,
      successMessage: string,
      shouldValidate: boolean = false
    ) => {
      if (!ticketId || isProcessing) return
      
      if (shouldValidate && !validationSteps.trim() && !validationNotes.trim()) {
        setValidationError('Please provide an explanation (steps to validate or notes) before failing the ticket.')
        return
      }
      
      setValidationError(null)
      setValidationSuccess(null)
      setIsProcessing(true)
      
      try {
        await action()
        setValidationSuccess(successMessage)
        setValidationSteps('')
        setValidationNotes('')
        refreshTicketAfterDelay(_onTicketUpdate)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        const actionType = shouldValidate ? 'fail' : 'pass'
        setValidationError(`Failed to ${actionType} ticket: ${errorMessage}`)
        console.error(`Failed to ${actionType} validation:`, err)
      } finally {
        setIsProcessing(false)
      }
    },
    [ticketId, isProcessing, validationSteps, validationNotes, _onTicketUpdate]
  )

  const handlePass = useCallback(async () => {
    const successMessage = getValidationSuccessMessage(columnId, true)
    await handleValidationAction(
      () => onValidationPass(ticketId),
      successMessage,
      false
    )
  }, [ticketId, onValidationPass, columnId, handleValidationAction])

  const handleFail = useCallback(async () => {
    const successMessage = getValidationSuccessMessage(columnId, false)
    await handleValidationAction(
      () => onValidationFail(ticketId, validationSteps, validationNotes),
      successMessage,
      true
    )
  }, [ticketId, validationSteps, validationNotes, onValidationFail, columnId, handleValidationAction])

  // Reset validation fields when modal closes
  useEffect(() => {
    if (!open) {
      clearValidationState(setValidationSteps, setValidationNotes, setValidationError, setValidationSuccess)
      setIsProcessing(false)
    }
  }, [open])

  const handleStepsChange = useCallback((value: string) => {
    setValidationSteps(value)
    if (validationError) setValidationError(null)
  }, [validationError])

  const handleNotesChange = useCallback((value: string) => {
    setValidationNotes(value)
    if (validationError) setValidationError(null)
  }, [validationError])

  if (!open) return null

  // Compute derived values
  const parsedBody = body ? parseFrontmatter(body) : { frontmatter: {}, body: '' }
  const priority = body ? extractPriority(parsedBody.frontmatter, body) : null
  const markdownBody = body ? stripQAInformationBlockFromBody(parsedBody.body) : ''
  const showValidationSection = columnId === 'col-human-in-the-loop'
  const showProcessReviewSection = columnId === 'col-process-review'
  const hasHumanFeedback = markdownBody?.includes('## ⚠️ Human Feedback')

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
          {failureCounts?.qa > 0 && (
            <span className="ticket-detail-failure-count" style={{ color: getFailureCountColor(failureCounts.qa) }}>
              QA fails: {failureCounts.qa}
            </span>
          )}
          {failureCounts?.hitl > 0 && (
            <span className="ticket-detail-failure-count" style={{ color: getFailureCountColor(failureCounts.hitl) }}>
              HITL fails: {failureCounts.hitl}
            </span>
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
                data-has-human-feedback={hasHumanFeedback ? 'true' : undefined}
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
                    onStepsChange={handleStepsChange}
                    onNotesChange={handleNotesChange}
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
