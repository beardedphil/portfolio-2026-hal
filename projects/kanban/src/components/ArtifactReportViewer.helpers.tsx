import React from 'react'
import type { Components } from 'react-markdown'
import type { SupabaseAgentArtifactRow } from '../App.types'
import { MarkdownImage } from './MarkdownImage'

/**
 * Check if an artifact is a git diff artifact based on its title
 */
export function isGitDiffArtifact(artifact: SupabaseAgentArtifactRow | null): boolean {
  if (!artifact) return false
  const normalizedTitle = artifact.title?.toLowerCase().trim() || ''
  return normalizedTitle.startsWith('git diff for ticket') || normalizedTitle.startsWith('git-diff for ticket')
}

/**
 * Sort artifacts chronologically (oldest first)
 * If timestamps are equal, sort by artifact_id for deterministic ordering
 */
export function sortArtifactsChronologically(
  artifacts: SupabaseAgentArtifactRow[],
  fallbackArtifact?: SupabaseAgentArtifactRow | null
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
 * Find the index of an artifact in a sorted list
 */
export function findArtifactIndex(
  artifact: SupabaseAgentArtifactRow | null,
  sortedArtifacts: SupabaseAgentArtifactRow[]
): number {
  if (!artifact || !artifact.artifact_id) return -1
  return sortedArtifacts.findIndex(a => a.artifact_id === artifact.artifact_id)
}

/**
 * Extract image source from markdown using node position
 */
export function extractImageSrcFromMarkdown(
  node: any,
  bodyMd: string
): string | null {
  let src = node?.properties?.src
  
  if (!src || src === '') {
    // Extract from raw markdown using node position
    const position = node?.position
    if (position && bodyMd) {
      const startOffset = position.start?.offset || 0
      const endOffset = position.end?.offset || bodyMd.length
      const markdownSnippet = bodyMd.substring(startOffset, endOffset)
      
      // Try to extract data URL from markdown: ![alt](data:image/...)
      const dataUrlMatch = markdownSnippet.match(/!\[.*?\]\((data:image\/[^)]+)\)/)
      if (dataUrlMatch && dataUrlMatch[1]) {
        src = dataUrlMatch[1]
        console.log('[ImageComponent] Extracted data URL from markdown using position')
      } else {
        // Try simpler pattern: (data:image/...)
        const simpleMatch = markdownSnippet.match(/\((data:image\/[^)]+)\)/)
        if (simpleMatch && simpleMatch[1]) {
          src = simpleMatch[1]
          console.log('[ImageComponent] Extracted data URL using simple pattern')
        }
      }
    }
  }
  
  return src || null
}

/**
 * Create markdown image component for ReactMarkdown
 */
export function createMarkdownImageComponent(
  artifactTitle: string | undefined,
  bodyMd: string,
  onImageClick: (src: string, alt: string) => void
): Components {
  const ImageComponent = (props: any) => {
    const node = props.node
    const alt = node?.properties?.alt || node?.alt || props.alt || null
    
    const src = extractImageSrcFromMarkdown(node, bodyMd)
    
    if (!src || src === '') {
      console.warn('[ImageComponent] Still no src after extraction. Node:', node)
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
  
  return {
    img: ImageComponent,
  }
}

/**
 * Validate artifact and prepare content for rendering
 */
export function validateAndPrepareArtifactContent(
  artifact: SupabaseAgentArtifactRow | null,
  isGitDiff: boolean
): {
  isValid: boolean
  title: string
  bodyMd: string
  errorMessage: string | null
} {
  if (!artifact || !artifact.artifact_id) {
    return {
      isValid: false,
      title: 'Artifact Viewer',
      bodyMd: '',
      errorMessage: artifact 
        ? 'Invalid artifact data. Please try selecting the artifact again.'
        : 'No artifact selected. Please select an artifact from the list.',
    }
  }
  
  const title = artifact.title || 'Untitled Artifact'
  const bodyMd = artifact.body_md || ''
  
  if (!bodyMd || typeof bodyMd !== 'string') {
    return {
      isValid: false,
      title,
      bodyMd: '',
      errorMessage: 'No content available. This artifact may be missing body_md data.',
    }
  }
  
  const trimmedBody = bodyMd.trim()
  if (trimmedBody.length === 0) {
    return {
      isValid: false,
      title,
      bodyMd: '',
      errorMessage: isGitDiff
        ? 'No diff available. This artifact was created but contains no diff content.'
        : 'No output produced. This artifact was created but contains no content.',
    }
  }
  
  return {
    isValid: true,
    title,
    bodyMd: trimmedBody,
    errorMessage: null,
  }
}
