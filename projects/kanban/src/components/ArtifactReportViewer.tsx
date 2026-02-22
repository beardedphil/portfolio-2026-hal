import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import { GitDiffViewer } from '../GitDiffViewer'
import { ImageViewerModal } from './ImageViewerModal'
import { MarkdownImage } from './MarkdownImage'
import { getAgentTypeDisplayName } from './utils'
import type { SupabaseAgentArtifactRow } from '../App.types'

// Helper functions extracted to reduce component complexity

/** Extract data URL from markdown snippet using regex patterns */
function extractDataUrlFromMarkdown(markdownSnippet: string): string | null {
  const dataUrlMatch = markdownSnippet.match(/!\[.*?\]\((data:image\/[^)]+)\)/)
  if (dataUrlMatch?.[1]) {
    return dataUrlMatch[1]
  }
  const simpleMatch = markdownSnippet.match(/\((data:image\/[^)]+)\)/)
  return simpleMatch?.[1] || null
}

/** Extract image source from ReactMarkdown node, falling back to markdown extraction */
function extractImageSource(node: any, bodyMd: string): string | null {
  const src = node?.properties?.src
  if (src) return src

  const position = node?.position
  if (!position || !bodyMd) return null

  const startOffset = position.start?.offset || 0
  const endOffset = position.end?.offset || bodyMd.length
  const markdownSnippet = bodyMd.substring(startOffset, endOffset)
  
  return extractDataUrlFromMarkdown(markdownSnippet)
}

/** Create image component for ReactMarkdown */
function createImageComponent(
  artifactTitle: string | undefined,
  bodyMd: string,
  onImageClick: (src: string, alt: string) => void
) {
  return (props: any) => {
    const node = props.node
    const alt = node?.properties?.alt || node?.alt || props.alt || null
    const src = extractImageSource(node, bodyMd)

    if (!src) {
      console.warn('[ImageComponent] Unable to extract image source. Node:', node)
      return (
        <div style={{ border: '2px solid red', padding: '1rem', backgroundColor: '#ffebee' }}>
          <p style={{ margin: 0, fontWeight: 'bold' }}>Unable to extract image source</p>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>
            Alt: {alt || 'Unknown'}
          </p>
        </div>
      )
    }

    return (
      <MarkdownImage
        src={src}
        alt={alt}
        artifactTitle={artifactTitle}
        onImageClick={onImageClick}
      />
    )
  }
}

/** Check if artifact is a git-diff artifact by title */
function isGitDiffArtifact(artifact: SupabaseAgentArtifactRow | null): boolean {
  if (!artifact) return false
  const normalizedTitle = artifact.title?.toLowerCase().trim() || ''
  return normalizedTitle.startsWith('git diff for ticket') || normalizedTitle.startsWith('git-diff for ticket')
}

/** Sort artifacts chronologically (oldest first) with deterministic secondary sort */
function sortArtifactsChronologically(
  artifacts: SupabaseAgentArtifactRow[],
  fallbackArtifact: SupabaseAgentArtifactRow | null
): SupabaseAgentArtifactRow[] {
  if (artifacts.length === 0 && fallbackArtifact) {
    return [fallbackArtifact]
  }
  return [...artifacts].sort((a, b) => {
    const timeA = new Date(a.created_at || 0).getTime()
    const timeB = new Date(b.created_at || 0).getTime()
    if (timeA !== timeB) {
      return timeA - timeB
    }
    return (a.artifact_id || '').localeCompare(b.artifact_id || '')
  })
}

/** Calculate effective index of current artifact in sorted list */
function calculateEffectiveIndex(
  artifact: SupabaseAgentArtifactRow | null,
  sortedArtifacts: SupabaseAgentArtifactRow[],
  currentIndex: number
): number {
  if (!artifact?.artifact_id) return currentIndex
  const actualIndex = sortedArtifacts.findIndex(a => a.artifact_id === artifact.artifact_id)
  if (actualIndex >= 0) return actualIndex
  return sortedArtifacts.length > 0 ? 0 : currentIndex
}

/** Handle tab key trapping for modal focus management */
function handleTabKeyTrapping(
  e: React.KeyboardEvent,
  modalRef: React.RefObject<HTMLDivElement>
): void {
  if (e.key !== 'Tab' || !modalRef.current) return

  const focusable = modalRef.current.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )
  const list = Array.from(focusable)
  const first = list[0]
  const last = list[list.length - 1]

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last?.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first?.focus()
  }
}

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
  // Early return if modal is not open (before hooks - this is OK)
  if (!open) return null

  // ALL HOOKS MUST BE CALLED BEFORE ANY OTHER EARLY RETURNS
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
      handleTabKeyTrapping(e, modalRef)
    },
    [onClose, imageViewerOpen]
  )

  const handleImageClick = useCallback((src: string, alt: string) => {
    setImageViewerSrc(src)
    setImageViewerAlt(alt || artifact?.title || 'Image')
    setImageViewerOpen(true)
  }, [artifact])

  // Custom image component for ReactMarkdown (0158)
  const markdownComponents: Components = useMemo(() => {
    const artifactTitle = artifact?.title
    const bodyMd = artifact?.body_md || ''
    return {
      img: createImageComponent(artifactTitle, bodyMd, handleImageClick),
    }
  }, [artifact?.title, artifact?.body_md, handleImageClick])

  // Check if this is a git-diff artifact
  const isGitDiff = useMemo(() => isGitDiffArtifact(artifact), [artifact])

  // Calculate navigation state (0148) - must be called before any early returns
  const sortedArtifacts = useMemo(
    () => sortArtifactsChronologically(artifacts, artifact),
    [artifacts, artifact]
  )
  
  const effectiveIndex = useMemo(
    () => calculateEffectiveIndex(artifact, sortedArtifacts, currentIndex),
    [artifact, sortedArtifacts, currentIndex]
  )
  
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

  // Handle invalid artifacts in render logic (not early returns after hooks)
  // This ensures hooks are always called in the same order
  const isValidArtifact = artifact && artifact.artifact_id
  const artifactTitle = isValidArtifact ? (artifact.title || 'Untitled Artifact') : 'Artifact Viewer'
  const artifactBodyMd = isValidArtifact ? (artifact.body_md || '') : ''
  const artifactCreatedAt = isValidArtifact ? (artifact.created_at || new Date().toISOString()) : new Date().toISOString()
  const artifactAgentType = isValidArtifact ? (artifact.agent_type || 'unknown') : 'unknown'

  const createdAt = new Date(artifactCreatedAt)
  const displayName = isValidArtifact ? getAgentTypeDisplayName(artifactAgentType) : 'Unknown'

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
            {(() => {
              // Handle invalid artifacts (no early returns after hooks)
              if (!isValidArtifact) {
                console.error('ArtifactReportViewer: Invalid artifact received', artifact)
                return (
                  <p className="ticket-detail-empty" style={{ fontStyle: 'italic', color: '#666' }}>
                    {!artifact 
                      ? 'No artifact selected. Please select an artifact from the list.'
                      : 'Invalid artifact data. Please try selecting the artifact again.'}
                  </p>
                )
              }
              
              // Ensure we have valid content to render
              if (!artifactBodyMd || typeof artifactBodyMd !== 'string') {
                return (
                  <p className="ticket-detail-empty" style={{ fontStyle: 'italic', color: '#666' }}>
                    No content available. This artifact may be missing body_md data.
                  </p>
                )
              }
              
              const trimmedBody = artifactBodyMd.trim()
              if (trimmedBody.length === 0) {
                return (
                  <p className="ticket-detail-empty" style={{ fontStyle: 'italic', color: '#666' }}>
                    {isGitDiff 
                      ? 'No diff available. This artifact was created but contains no diff content.'
                      : 'No output produced. This artifact was created but contains no content.'}
                  </p>
                )
              }
              
              // Render content
              if (isGitDiff) {
                return <GitDiffViewer diff={trimmedBody} />
              } else {
                return <ReactMarkdown components={markdownComponents}>{trimmedBody}</ReactMarkdown>
              }
            })()}
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
