import React from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import { GitDiffViewer } from '../GitDiffViewer'
import type { SupabaseAgentArtifactRow } from '../App.types'

/**
 * Extracts image source URL from markdown node when ReactMarkdown sanitizes data URLs.
 * Falls back to extracting from raw markdown using node position.
 */
export function extractImageSrc(
  node: any,
  bodyMd: string
): string | null {
  // First try to get src from node properties
  let src = node?.properties?.src

  if (src && src !== '') {
    return src
  }

  // If src is empty, try to extract from raw markdown using position
  const position = node?.position
  if (!position || !bodyMd) {
    return null
  }

  const startOffset = position.start?.offset || 0
  const endOffset = position.end?.offset || bodyMd.length
  const markdownSnippet = bodyMd.substring(startOffset, endOffset)

  // Try to extract data URL from markdown: ![alt](data:image/...)
  const dataUrlMatch = markdownSnippet.match(/!\[.*?\]\((data:image\/[^)]+)\)/)
  if (dataUrlMatch && dataUrlMatch[1]) {
    return dataUrlMatch[1]
  }

  // Try simpler pattern: (data:image/...)
  const simpleMatch = markdownSnippet.match(/\((data:image\/[^)]+)\)/)
  if (simpleMatch && simpleMatch[1]) {
    return simpleMatch[1]
  }

  return null
}

/**
 * Checks if an artifact is a git-diff artifact based on its title.
 */
export function isGitDiffArtifact(artifact: SupabaseAgentArtifactRow | null): boolean {
  if (!artifact) return false
  const normalizedTitle = artifact.title?.toLowerCase().trim() || ''
  return (
    normalizedTitle.startsWith('git diff for ticket') ||
    normalizedTitle.startsWith('git-diff for ticket')
  )
}

/**
 * Sorts artifacts chronologically (oldest first) with deterministic secondary sort.
 */
export function sortArtifactsChronologically(
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
    // Secondary sort by artifact_id for deterministic ordering when timestamps are equal
    return (a.artifact_id || '').localeCompare(b.artifact_id || '')
  })
}

/**
 * Finds the index of an artifact in a sorted list.
 */
export function findArtifactIndex(
  artifact: SupabaseAgentArtifactRow | null,
  sortedArtifacts: SupabaseAgentArtifactRow[]
): number {
  if (!artifact || !artifact.artifact_id) return -1
  return sortedArtifacts.findIndex(a => a.artifact_id === artifact.artifact_id)
}

/**
 * Calculates the effective index for navigation, with fallback logic.
 */
export function calculateEffectiveIndex(
  actualIndex: number,
  artifact: SupabaseAgentArtifactRow | null,
  sortedArtifacts: SupabaseAgentArtifactRow[],
  currentIndex: number
): number {
  if (actualIndex >= 0) {
    return actualIndex
  }
  if (artifact && sortedArtifacts.length > 0) {
    return 0
  }
  return currentIndex
}

/**
 * Handles keyboard events for modal (Escape key and Tab trapping).
 */
export function createKeyboardHandler(
  onClose: () => void,
  imageViewerOpen: boolean,
  onCloseImageViewer: () => void,
  modalRef: React.RefObject<HTMLDivElement>
) {
  return (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (imageViewerOpen) {
        onCloseImageViewer()
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
  }
}

/**
 * Renders artifact content with proper error handling and content type detection.
 */
export function renderArtifactContent(
  isValidArtifact: boolean,
  artifact: SupabaseAgentArtifactRow | null,
  artifactBodyMd: string,
  isGitDiff: boolean,
  markdownComponents: Components
): React.ReactNode {
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

  if (isGitDiff) {
    return <GitDiffViewer diff={trimmedBody} />
  }

  return <ReactMarkdown components={markdownComponents}>{trimmedBody}</ReactMarkdown>
}
