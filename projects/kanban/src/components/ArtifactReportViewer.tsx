import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import { GitDiffViewer } from '../GitDiffViewer'
import { ImageViewerModal } from './ImageViewerModal'
import { MarkdownImage } from './MarkdownImage'
import { getAgentTypeDisplayName } from './utils'
import type { SupabaseAgentArtifactRow } from '../App.types'

// Helper: Extract image source from markdown node
function extractImageSource(node: any, bodyMd: string): string | null {
  let src = node?.properties?.src
  if (src) return src

  const position = node?.position
  if (!position || !bodyMd) return null

  const startOffset = position.start?.offset || 0
  const endOffset = position.end?.offset || bodyMd.length
  const markdownSnippet = bodyMd.substring(startOffset, endOffset)

  // Try to extract data URL from markdown: ![alt](data:image/...)
  const dataUrlMatch = markdownSnippet.match(/!\[.*?\]\((data:image\/[^)]+)\)/)
  if (dataUrlMatch?.[1]) return dataUrlMatch[1]

  // Try simpler pattern: (data:image/...)
  const simpleMatch = markdownSnippet.match(/\((data:image\/[^)]+)\)/)
  return simpleMatch?.[1] || null
}

// Helper: Check if artifact is a git diff
function isGitDiffArtifact(artifact: SupabaseAgentArtifactRow | null): boolean {
  if (!artifact) return false
  const normalizedTitle = artifact.title?.toLowerCase().trim() || ''
  return normalizedTitle.startsWith('git diff for ticket') || normalizedTitle.startsWith('git-diff for ticket')
}

// Helper: Sort artifacts chronologically
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
    if (timeA !== timeB) return timeA - timeB
    return (a.artifact_id || '').localeCompare(b.artifact_id || '')
  })
}

// Helper: Handle focus trap for Tab key
function handleFocusTrap(e: React.KeyboardEvent, modalRef: React.RefObject<HTMLDivElement>) {
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

// Helper: Normalize artifact data
function normalizeArtifact(artifact: SupabaseAgentArtifactRow | null) {
  const isValid = artifact && artifact.artifact_id
  return {
    isValid,
    title: isValid ? (artifact.title || 'Untitled Artifact') : 'Artifact Viewer',
    bodyMd: isValid ? (artifact.body_md || '') : '',
    createdAt: isValid ? (artifact.created_at || new Date().toISOString()) : new Date().toISOString(),
    agentType: isValid ? (artifact.agent_type || 'unknown') : 'unknown',
  }
}

// Helper: Render artifact content
function renderArtifactContent(
  artifact: SupabaseAgentArtifactRow | null,
  isValid: boolean,
  bodyMd: string,
  isGitDiff: boolean,
  markdownComponents: Components
) {
  if (!isValid) {
    console.error('ArtifactReportViewer: Invalid artifact received', artifact)
    return (
      <p className="ticket-detail-empty" style={{ fontStyle: 'italic', color: '#666' }}>
        {!artifact
          ? 'No artifact selected. Please select an artifact from the list.'
          : 'Invalid artifact data. Please try selecting the artifact again.'}
      </p>
    )
  }

  if (!bodyMd || typeof bodyMd !== 'string') {
    return (
      <p className="ticket-detail-empty" style={{ fontStyle: 'italic', color: '#666' }}>
        No content available. This artifact may be missing body_md data.
      </p>
    )
  }

  const trimmedBody = bodyMd.trim()
  if (trimmedBody.length === 0) {
    return (
      <p className="ticket-detail-empty" style={{ fontStyle: 'italic', color: '#666' }}>
        {isGitDiff
          ? 'No diff available. This artifact was created but contains no diff content.'
          : 'No output produced. This artifact was created but contains no content.'}
      </p>
    )
  }

  return isGitDiff ? (
    <GitDiffViewer diff={trimmedBody} />
  ) : (
    <ReactMarkdown components={markdownComponents}>{trimmedBody}</ReactMarkdown>
  )
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
  const [imageViewerOpen, setImageViewerOpen] = useState(false)
  const [imageViewerSrc, setImageViewerSrc] = useState<string | null>(null)
  const [imageViewerAlt, setImageViewerAlt] = useState<string>('')
  const modalRef = useRef<HTMLDivElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  // Manage body overflow
  useEffect(() => {
    if (!open) {
      setImageViewerOpen(false)
      return
    }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Focus management
  useEffect(() => {
    if (!open || !modalRef.current) return
    const el = closeBtnRef.current ?? modalRef.current.querySelector<HTMLElement>('button, [href], input, select, textarea')
    el?.focus()
  }, [open])

  // Keyboard handlers
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
      handleFocusTrap(e, modalRef)
    },
    [onClose, imageViewerOpen]
  )

  const handleImageClick = useCallback((src: string, alt: string) => {
    setImageViewerSrc(src)
    setImageViewerAlt(alt || artifact?.title || 'Image')
    setImageViewerOpen(true)
  }, [artifact])

  // Markdown components with custom image handler
  const markdownComponents: Components = useMemo(() => {
    const artifactTitle = artifact?.title
    const bodyMd = artifact?.body_md || ''

    const ImageComponent = (props: any) => {
      const node = props.node
      const alt = node?.properties?.alt || node?.alt || props.alt || null
      const src = extractImageSource(node, bodyMd)

      if (!src) {
        console.warn('[ImageComponent] Unable to extract image source. Node:', node)
        return (
          <div style={{ border: '2px solid red', padding: '1rem', backgroundColor: '#ffebee' }}>
            <p style={{ margin: 0, fontWeight: 'bold' }}>Unable to extract image source</p>
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>Alt: {alt || 'Unknown'}</p>
          </div>
        )
      }

      return (
        <MarkdownImage
          src={src}
          alt={alt}
          artifactTitle={artifactTitle}
          onImageClick={handleImageClick}
        />
      )
    }

    return { img: ImageComponent }
  }, [artifact?.title, artifact?.body_md, handleImageClick])

  // Computed values
  const isGitDiff = useMemo(() => isGitDiffArtifact(artifact), [artifact])
  const sortedArtifacts = useMemo(() => sortArtifactsChronologically(artifacts, artifact), [artifacts, artifact])
  const normalized = useMemo(() => normalizeArtifact(artifact), [artifact])

  // Navigation state
  const actualIndex = useMemo(() => {
    if (!artifact?.artifact_id) return -1
    return sortedArtifacts.findIndex(a => a.artifact_id === artifact.artifact_id)
  }, [sortedArtifacts, artifact])

  const effectiveIndex = actualIndex >= 0 ? actualIndex : (artifact && sortedArtifacts.length > 0 ? 0 : currentIndex)
  const canGoPrevious = effectiveIndex > 0
  const canGoNext = effectiveIndex < sortedArtifacts.length - 1

  const handlePrevious = useCallback(() => {
    if (canGoPrevious) onNavigate(effectiveIndex - 1)
  }, [canGoPrevious, effectiveIndex, onNavigate])

  const handleNext = useCallback(() => {
    if (canGoNext) onNavigate(effectiveIndex + 1)
  }, [canGoNext, effectiveIndex, onNavigate])

  // Render
  const createdAt = new Date(normalized.createdAt)
  const displayName = normalized.isValid ? getAgentTypeDisplayName(normalized.agentType) : 'Unknown'

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
            {normalized.title}
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
            {renderArtifactContent(artifact, normalized.isValid, normalized.bodyMd, isGitDiff, markdownComponents)}
          </div>
        </div>
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
