import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import { GitDiffViewer } from '../GitDiffViewer'
import { ImageViewerModal } from './ImageViewerModal'
import { MarkdownImage } from './MarkdownImage'
import { getAgentTypeDisplayName } from './utils'
import type { SupabaseAgentArtifactRow } from '../App.types'

/** Check if artifact is a git diff based on title */
function isGitDiffArtifact(artifact: SupabaseAgentArtifactRow | null): boolean {
  if (!artifact) return false
  const title = artifact.title?.toLowerCase().trim() || ''
  return title.startsWith('git diff for ticket') || title.startsWith('git-diff for ticket')
}

/** Extract image source from markdown node position */
function extractImageSource(node: any, bodyMd: string): string | null {
  const src = node?.properties?.src
  if (src) return src

  const position = node?.position
  if (!position || !bodyMd) return null

  const snippet = bodyMd.substring(position.start?.offset || 0, position.end?.offset || bodyMd.length)
  const match = snippet.match(/!\[.*?\]\((data:image\/[^)]+)\)/) || snippet.match(/\((data:image\/[^)]+)\)/)
  return match?.[1] || null
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

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (imageViewerOpen) {
          setImageViewerOpen(false)
        } else {
          onClose()
        }
        return
      }
      if (e.key !== 'Tab' || !modalRef.current) return

      const focusable = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      )
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (e.shiftKey && active === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first?.focus()
      }
    },
    [onClose, imageViewerOpen]
  )

  const handleImageClick = useCallback(
    (src: string, alt: string) => {
      setImageViewerSrc(src)
      setImageViewerAlt(alt || artifact?.title || 'Image')
      setImageViewerOpen(true)
    },
    [artifact]
  )

  // Markdown components
  const markdownComponents: Components = useMemo(() => {
    const bodyMd = artifact?.body_md || ''
    return {
      img: (props: any) => {
        const node = props.node
        const alt = node?.properties?.alt || node?.alt || props.alt || null
        const src = extractImageSource(node, bodyMd)

        if (!src) {
          console.warn('[ImageComponent] Unable to extract image source')
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
            artifactTitle={artifact?.title}
            onImageClick={handleImageClick}
          />
        )
      },
    }
  }, [artifact?.title, artifact?.body_md, handleImageClick])

  // Navigation state
  const sortedArtifacts = useMemo(() => {
    const list = artifacts.length === 0 && artifact ? [artifact] : [...artifacts]
    return list.sort((a, b) => {
      const timeA = new Date(a.created_at || 0).getTime()
      const timeB = new Date(b.created_at || 0).getTime()
      return timeA !== timeB ? timeA - timeB : (a.artifact_id || '').localeCompare(b.artifact_id || '')
    })
  }, [artifacts, artifact])

  const effectiveIndex = useMemo(() => {
    if (!artifact?.artifact_id) return currentIndex
    const idx = sortedArtifacts.findIndex(a => a.artifact_id === artifact.artifact_id)
    return idx >= 0 ? idx : (sortedArtifacts.length > 0 ? 0 : currentIndex)
  }, [artifact, sortedArtifacts, currentIndex])

  const canGoPrevious = effectiveIndex > 0
  const canGoNext = effectiveIndex < sortedArtifacts.length - 1

  const handlePrevious = useCallback(() => {
    if (canGoPrevious) onNavigate(effectiveIndex - 1)
  }, [canGoPrevious, effectiveIndex, onNavigate])

  const handleNext = useCallback(() => {
    if (canGoNext) onNavigate(effectiveIndex + 1)
  }, [canGoNext, effectiveIndex, onNavigate])

  // Artifact data
  const isValidArtifact = Boolean(artifact?.artifact_id)
  const artifactTitle = isValidArtifact ? (artifact!.title || 'Untitled Artifact') : 'Artifact Viewer'
  const artifactBodyMd = isValidArtifact ? (artifact!.body_md || '') : ''
  const artifactCreatedAt = isValidArtifact ? (artifact!.created_at || new Date().toISOString()) : new Date().toISOString()
  const artifactAgentType = isValidArtifact ? (artifact!.agent_type || 'unknown') : 'unknown'
  const isGitDiff = useMemo(() => isGitDiffArtifact(artifact), [artifact])

  if (!open) return null

  // Render content
  let content: React.ReactNode
  if (!isValidArtifact) {
    content = (
      <p className="ticket-detail-empty" style={{ fontStyle: 'italic', color: '#666' }}>
        {!artifact ? 'No artifact selected. Please select an artifact from the list.' : 'Invalid artifact data. Please try selecting the artifact again.'}
      </p>
    )
  } else if (!artifactBodyMd || typeof artifactBodyMd !== 'string') {
    content = (
      <p className="ticket-detail-empty" style={{ fontStyle: 'italic', color: '#666' }}>
        No content available. This artifact may be missing body_md data.
      </p>
    )
  } else {
    const trimmedBody = artifactBodyMd.trim()
    if (trimmedBody.length === 0) {
      content = (
        <p className="ticket-detail-empty" style={{ fontStyle: 'italic', color: '#666' }}>
          {isGitDiff ? 'No diff available. This artifact was created but contains no diff content.' : 'No output produced. This artifact was created but contains no content.'}
        </p>
      )
    } else {
      content = isGitDiff ? <GitDiffViewer diff={trimmedBody} /> : <ReactMarkdown components={markdownComponents}>{trimmedBody}</ReactMarkdown>
    }
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
          <span className="ticket-detail-id">Agent type: {getAgentTypeDisplayName(artifactAgentType)}</span>
          <span className="ticket-detail-priority">Created: {new Date(artifactCreatedAt).toLocaleString()}</span>
        </div>
        <div className="ticket-detail-body-wrap">
          <div className="ticket-detail-body">{content}</div>
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
