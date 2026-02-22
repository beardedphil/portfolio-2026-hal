import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import { GitDiffViewer } from '../GitDiffViewer'
import { ImageViewerModal } from './ImageViewerModal'
import { MarkdownImage } from './MarkdownImage'
import { getAgentTypeDisplayName } from './utils'
import type { SupabaseAgentArtifactRow } from '../App.types'
import {
  extractImageSrc,
  isGitDiffArtifact,
  sortArtifactsChronologically,
  findArtifactIndex,
  calculateEffectiveIndex,
  createKeyboardHandler,
  renderArtifactContent,
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
    createKeyboardHandler(
      onClose,
      imageViewerOpen,
      () => setImageViewerOpen(false),
      modalRef
    ),
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
    const imageClickHandler = handleImageClick
    const bodyMd = artifact?.body_md || ''
    
    const ImageComponent = (props: any) => {
      const node = props.node
      const alt = node?.properties?.alt || node?.alt || props.alt || null
      const src = extractImageSrc(node, bodyMd)
      
      if (!src || src === '') {
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
          onImageClick={imageClickHandler}
        />
      )
    }
    
    return {
      img: ImageComponent,
    }
  }, [artifact?.title, artifact?.body_md, handleImageClick])

  // Check if this is a git-diff artifact
  const isGitDiff = useMemo(() => isGitDiffArtifact(artifact), [artifact])

  // Calculate navigation state (0148) - must be called before any early returns
  const sortedArtifacts = useMemo(
    () => sortArtifactsChronologically(artifacts, artifact),
    [artifacts, artifact]
  )
  
  const actualIndex = useMemo(
    () => findArtifactIndex(artifact, sortedArtifacts),
    [sortedArtifacts, artifact]
  )
  
  const effectiveIndex = useMemo(
    () => calculateEffectiveIndex(actualIndex, artifact, sortedArtifacts, currentIndex),
    [actualIndex, artifact, sortedArtifacts, currentIndex]
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
            {renderArtifactContent(
              isValidArtifact,
              artifact,
              artifactBodyMd,
              isGitDiff,
              markdownComponents
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
