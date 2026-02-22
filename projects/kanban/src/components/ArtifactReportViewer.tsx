import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import { GitDiffViewer } from '../GitDiffViewer'
import { ImageViewerModal } from './ImageViewerModal'
import { getAgentTypeDisplayName } from './utils'
import type { SupabaseAgentArtifactRow } from '../App.types'
import {
  isGitDiffArtifact,
  sortArtifactsChronologically,
  findArtifactIndex,
  createMarkdownImageComponent,
  validateAndPrepareArtifactContent,
} from './ArtifactReportViewer.helpers'

/** Artifact report viewer modal (0082) with Previous/Next navigation (0148) */
export function ArtifactReportViewer({
  open,
  onClose,
  artifact,
  artifacts,
  currentIndex,
  onNavigate,
}: {
  open: boolean
  onClose: () => void
  artifact: SupabaseAgentArtifactRow | null
  artifacts: SupabaseAgentArtifactRow[]
  currentIndex: number
  onNavigate: (index: number) => void
}) {
  // ALL HOOKS MUST BE CALLED BEFORE ANY EARLY RETURNS
  // This fixes React error #310 (hooks called conditionally)
  const [imageViewerOpen, setImageViewerOpen] = useState(false)
  const [imageViewerSrc, setImageViewerSrc] = useState<string | null>(null)
  const [imageViewerAlt, setImageViewerAlt] = useState<string>('')
  const modalRef = useRef<HTMLDivElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) {
      // Close image viewer when artifact viewer closes
      setImageViewerOpen(false)
      return
    }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!open || !modalRef.current) return
    const el = closeBtnRef.current ?? modalRef.current.querySelector<HTMLElement>('button, [href], input, select, textarea')
    el?.focus()
  }, [open])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (imageViewerOpen) {
          setImageViewerOpen(false)
          return
        }
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
    [onClose, imageViewerOpen]
  )

  const handleImageClick = useCallback((src: string, alt: string) => {
    setImageViewerSrc(src)
    setImageViewerAlt(alt || artifact?.title || 'Image')
    setImageViewerOpen(true)
  }, [artifact])

  // Check if this is a git-diff artifact
  const isGitDiff = useMemo(() => isGitDiffArtifact(artifact), [artifact])

  // Sort artifacts chronologically (oldest first)
  const sortedArtifacts = useMemo(
    () => sortArtifactsChronologically(artifacts, artifact),
    [artifacts, artifact]
  )

  // Find the actual index of the current artifact in the sorted list
  const actualIndex = useMemo(
    () => findArtifactIndex(artifact, sortedArtifacts),
    [artifact, sortedArtifacts]
  )
  
  // Use actual index if found, otherwise fall back to currentIndex prop, or 0 if artifact is in the list
  const effectiveIndex = actualIndex >= 0 ? actualIndex : (artifact && sortedArtifacts.length > 0 ? 0 : currentIndex)
  
  const canGoPrevious = effectiveIndex > 0
  const canGoNext = effectiveIndex < sortedArtifacts.length - 1
  
  const handlePrevious = useCallback(() => {
    if (canGoPrevious) {
      onNavigate(effectiveIndex - 1)
    }
  }, [canGoPrevious, effectiveIndex, onNavigate])
  
  const handleNext = useCallback(() => {
    if (canGoNext) {
      onNavigate(effectiveIndex + 1)
    }
  }, [canGoNext, effectiveIndex, onNavigate])

  // Validate and prepare artifact content
  const contentValidation = useMemo(
    () => validateAndPrepareArtifactContent(artifact, isGitDiff),
    [artifact, isGitDiff]
  )

  // Create markdown image component
  const markdownComponents = useMemo(() => {
    if (!contentValidation.isValid || !artifact) {
      return {}
    }
    return createMarkdownImageComponent(
      artifact.title,
      contentValidation.bodyMd,
      handleImageClick
    )
  }, [contentValidation.isValid, contentValidation.bodyMd, artifact, handleImageClick])

  // Prepare display data
  const artifactTitle = contentValidation.title
  const artifactCreatedAt = artifact?.created_at || new Date().toISOString()
  const artifactAgentType = artifact?.agent_type || 'unknown'
  const createdAt = new Date(artifactCreatedAt)
  const displayName = artifact ? getAgentTypeDisplayName(artifactAgentType) : 'Unknown'

  // Don't render content when closed, but always return a wrapper to satisfy React hooks rules
  if (!open) {
    return null
  }

  return (
    <div
      className="ticket-detail-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="artifact-viewer-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={handleKeyDown}
    >
      <div className="ticket-detail-modal" ref={modalRef}>
        <div className="ticket-detail-header">
          <h2 id="artifact-viewer-title" className="ticket-detail-title">
            {artifactTitle}
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
          <span className="ticket-detail-id">Agent type: {displayName}</span>
          <span className="ticket-detail-priority">Created: {createdAt.toLocaleString()}</span>
        </div>
        <div className="ticket-detail-body-wrap">
          <div className="ticket-detail-body">
            {!contentValidation.isValid ? (
              <p className="ticket-detail-empty" style={{ fontStyle: 'italic', color: '#666' }}>
                {contentValidation.errorMessage || 'Unable to display artifact content.'}
              </p>
            ) : isGitDiff ? (
              <GitDiffViewer diff={contentValidation.bodyMd} />
            ) : (
              <ReactMarkdown components={markdownComponents}>{contentValidation.bodyMd}</ReactMarkdown>
            )}
          </div>
        </div>
        {/* Previous/Next navigation buttons (0148) */}
        {sortedArtifacts.length > 1 && (
          <div className="artifact-navigation">
            <button
              type="button"
              className="artifact-nav-button artifact-nav-previous btn-standard"
              onClick={handlePrevious}
              disabled={!canGoPrevious}
              aria-label="Previous artifact"
            >
              Previous
            </button>
            <span className="artifact-nav-counter">
              {effectiveIndex + 1} of {sortedArtifacts.length}
            </span>
            <button
              type="button"
              className="artifact-nav-button artifact-nav-next btn-standard"
              onClick={handleNext}
              disabled={!canGoNext}
              aria-label="Next artifact"
            >
              Next
            </button>
          </div>
        )}
      </div>
      <ImageViewerModal
        open={imageViewerOpen}
        onClose={() => setImageViewerOpen(false)}
        imageSrc={imageViewerSrc}
        imageAlt={imageViewerAlt}
      />
    </div>
  )
}
