import React, { useState, useCallback, useRef, useEffect, useMemo, useContext } from 'react'
import { HalKanbanContext } from './HalKanbanContext'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  pointerWithin,
  rectIntersection,
  getFirstCollision,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { createClient } from '@supabase/supabase-js'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import { GitDiffViewer } from './GitDiffViewer'
import {
  extractFeatureBranch,
  checkMergedToMain,
  normalizeTitleLineInBody,
} from './lib/ticketBody'
import { TicketDetailModal } from './components/TicketDetailModal'
import { QAInfoSection } from './components/QAInfoSection'
import { AutoDismissMessage } from './components/AutoDismissMessage'
import { getAgentTypeDisplayName } from './components/utils'
import { SortableColumn } from './components/SortableColumn'
import { ImageViewerModal } from './components/ImageViewerModal'
import { MarkdownImage } from './components/MarkdownImage'

import type { Card, Column } from './lib/columnTypes'

type LogEntry = { id: number; message: string; at: string }

/** Supabase tickets table row (read-only v0) */
type SupabaseTicketRow = {
  /** Internal unique row id (0079). */
  pk: string
  /** Legacy id (pre-0079). Not globally unique after repo-scoped migration. */
  id: string
  filename: string
  title: string
  body_md: string
  kanban_column_id: string | null
  kanban_position: number | null
  kanban_moved_at: string | null
  updated_at: string
  /** Repo scope (0079). */
  repo_full_name?: string
  /** Per-repo ticket number (0079). */
  ticket_number?: number
  /** Human-facing display id like HAL-0079 (0079). */
  display_id?: string
}

/** Supabase kanban_columns table row (0020) */
type SupabaseKanbanColumnRow = {
  id: string
  title: string
  position: number
  created_at: string
  updated_at: string
}

/** Supabase agent_artifacts table row (0082) - exported from components/types.ts */
type SupabaseAgentArtifactRow = {
  artifact_id: string
  ticket_pk: string
  repo_full_name: string
  agent_type: 'implementation' | 'qa' | 'human-in-the-loop' | 'other'
  title: string
  body_md: string
  created_at: string
  updated_at: string
}

/** Supabase hal_agent_runs table row (0114) */
type SupabaseAgentRunRow = {
  run_id: string
  agent_type: 'implementation' | 'qa'
  repo_full_name: string
  ticket_pk: string | null
  ticket_number: number | null
  display_id: string | null
  status: 'created' | 'launching' | 'polling' | 'finished' | 'failed'
  created_at: string
  updated_at: string
}

/** Supabase ticket_attachments table row (0092) - exported from components/types.ts */
type TicketAttachment = {
  pk: string
  ticket_pk: string
  ticket_id: string
  filename: string
  mime_type: string
  data_url: string
  file_size: number | null
  created_at: string
}

const SUPABASE_CONFIG_KEY = 'supabase-ticketstore-config'
const CONNECTED_REPO_KEY = 'hal-connected-repo'
/** Polling interval when Supabase board is active (0013); 10s */
const SUPABASE_POLL_INTERVAL_MS = 10_000
/** Delay before refetch after a move so DB write is visible; avoids stale read overwriting last moves (0144) */
const REFETCH_AFTER_MOVE_MS = 2000 // Increased from 1500ms to give backend more time to persist
const _SUPABASE_SETUP_SQL = `create table if not exists public.tickets (
  id text primary key,
  filename text not null,
  title text not null,
  body_md text not null,
  kanban_column_id text null,
  kanban_position int null,
  kanban_moved_at timestamptz null,
  updated_at timestamptz not null default now()
);`

/** ticket_attachments table (0092): stores file attachments for tickets */
const _SUPABASE_TICKET_ATTACHMENTS_SETUP_SQL = `create table if not exists public.ticket_attachments (
  pk uuid primary key default gen_random_uuid(),
  ticket_pk text not null,
  ticket_id text not null,
  filename text not null,
  mime_type text not null,
  data_url text not null,
  file_size int,
  created_at timestamptz not null default now(),
  constraint fk_ticket foreign key (ticket_id) references public.tickets(id) on delete cascade
);`

/** kanban_columns table (0020); run in Supabase SQL editor if missing */
const _SUPABASE_KANBAN_COLUMNS_SETUP_SQL = `create table if not exists public.kanban_columns (
  id text primary key,
  title text not null,
  position int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);`

/** Default columns to seed when kanban_columns is empty (0020); backward-compatible IDs */
const DEFAULT_KANBAN_COLUMNS_SEED = [
  { id: 'col-unassigned', title: 'Unassigned', position: 0 },
  { id: 'col-todo', title: 'To-do', position: 1 },
  { id: 'col-doing', title: 'Doing', position: 2 },
  { id: 'col-qa', title: 'Ready for QA', position: 3 },
  { id: 'col-human-in-the-loop', title: 'Human in the Loop', position: 4 },
  { id: 'col-process-review', title: 'Process Review', position: 5 },
  { id: 'col-done', title: 'Done', position: 6 },
  { id: 'col-wont-implement', title: 'Will Not Implement', position: 7 },
] as const

function normalizeTicketRow(row: Partial<SupabaseTicketRow> & { id?: string }): SupabaseTicketRow {
  const legacyId = String(row.id ?? '').trim() || '0000'
  const pk = typeof row.pk === 'string' && row.pk.trim() ? row.pk.trim() : legacyId
  const displayId =
    typeof row.display_id === 'string' && row.display_id.trim()
      ? row.display_id.trim()
      : `LEG-${legacyId.padStart(4, '0')}`
  return {
    pk,
    id: legacyId,
    filename: String(row.filename ?? ''),
    title: String(row.title ?? ''),
    body_md: String(row.body_md ?? ''),
    kanban_column_id: (row.kanban_column_id ?? null) as string | null,
    kanban_position: (row.kanban_position ?? null) as number | null,
    kanban_moved_at: (row.kanban_moved_at ?? null) as string | null,
    updated_at: String(row.updated_at ?? ''),
    repo_full_name: row.repo_full_name,
    ticket_number: row.ticket_number,
    display_id: displayId,
  }
}

const DEFAULT_COLUMNS: Column[] = [
  { id: 'col-unassigned', title: 'Unassigned', cardIds: [] },
  { id: 'col-todo', title: 'To-do', cardIds: ['c-1', 'c-2', 'c-3'] },
  { id: 'col-doing', title: 'Doing', cardIds: ['c-4', 'c-5', 'c-6'] },
  { id: 'col-qa', title: 'Ready for QA', cardIds: [] },
  { id: 'col-human-in-the-loop', title: 'Human in the Loop', cardIds: [] },
  { id: 'col-process-review', title: 'Process Review', cardIds: [] },
  { id: 'col-done', title: 'Done', cardIds: ['c-7', 'c-8', 'c-9'] },
  { id: 'col-wont-implement', title: 'Will Not Implement', cardIds: [] },
]

/** Unassigned, To-do, Doing, Ready for QA, Human in the Loop, Process Review, Done, Will Not Implement; tickets with null or col-unassigned go in Unassigned */
const KANBAN_COLUMN_IDS = [
  'col-unassigned',
  'col-todo',
  'col-doing',
  'col-qa',
  'col-human-in-the-loop',
  'col-process-review',
  'col-done',
  'col-wont-implement',
] as const

/** Filter raw DB columns to canonical 7, in order; create fallbacks for missing. Use in connectSupabase and refetchSupabaseTickets. */
function canonicalizeColumnRows(
  rows: SupabaseKanbanColumnRow[]
): SupabaseKanbanColumnRow[] {
  const canonicalOrder = KANBAN_COLUMN_IDS as unknown as string[]
  const filtered = rows.filter((c) => canonicalOrder.includes(c.id))
  const titleById: Record<string, string> = {
    'col-qa': 'Ready for QA',
  }
  return canonicalOrder.map((id, i) => {
    const row = filtered.find((c) => c.id === id)
    return (
      row ?? {
        id,
        title: titleById[id] ?? id.replace('col-', '').replace(/-/g, ' '),
        position: i,
        created_at: '',
        updated_at: '',
      }
    )
  }) as SupabaseKanbanColumnRow[]
}
const EMPTY_KANBAN_COLUMNS: Column[] = [
  { id: 'col-unassigned', title: 'Unassigned', cardIds: [] },
  { id: 'col-todo', title: 'To-do', cardIds: [] },
  { id: 'col-doing', title: 'Doing', cardIds: [] },
  { id: 'col-qa', title: 'Ready for QA', cardIds: [] },
  { id: 'col-human-in-the-loop', title: 'Human in the Loop', cardIds: [] },
  { id: 'col-process-review', title: 'Process Review', cardIds: [] },
  { id: 'col-done', title: 'Done', cardIds: [] },
  { id: 'col-wont-implement', title: 'Will Not Implement', cardIds: [] },
]

const INITIAL_CARDS: Record<string, Card> = {
  'c-1': { id: 'c-1', title: 'Card A' },
  'c-2': { id: 'c-2', title: 'Card B' },
  'c-3': { id: 'c-3', title: 'Card C' },
  'c-4': { id: 'c-4', title: 'Card D' },
  'c-5': { id: 'c-5', title: 'Card E' },
  'c-6': { id: 'c-6', title: 'Card F' },
  'c-7': { id: 'c-7', title: 'Card G' },
  'c-8': { id: 'c-8', title: 'Card H' },
  'c-9': { id: 'c-9', title: 'Card I' },
}

function formatTime(): string {
  const d = new Date()
  return d.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0')
}

/**
 * Retry a fetch request with exponential backoff.
 * @param fetchFn Function that returns a Promise resolving to a Response
 * @param maxRetries Maximum number of retries (default: 3)
 * @param initialDelayMs Initial delay in milliseconds (default: 1000)
 * @returns Promise resolving to the Response
 */
async function fetchWithRetry(
  fetchFn: () => Promise<Response>,
  maxRetries: number = 3,
  initialDelayMs: number = 1000
): Promise<Response> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchFn()
      // Retry on 5xx errors and network errors (but not 4xx client errors)
      if (response.status >= 500 || response.status === 0) {
        if (attempt < maxRetries) {
          const delay = initialDelayMs * Math.pow(2, attempt)
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }
      }
      return response
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt < maxRetries) {
        const delay = initialDelayMs * Math.pow(2, attempt)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      throw lastError
    }
  }
  throw lastError || new Error('Fetch failed after retries')
}

/** Auto-dismiss component for success messages (0047) */
// AutoDismissMessage extracted to components/AutoDismissMessage.tsx

function stableColumnId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `col-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase()
}

// extractPriority extracted to components/utils.ts


// getAgentTypeDisplayName extracted to components/utils.ts
// ImageViewerModal extracted to components/ImageViewerModal.tsx
// MarkdownImage extracted to components/MarkdownImage.tsx

/** Artifact report viewer modal (0082) with Previous/Next navigation (0148) */
function ArtifactReportViewer({
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

  // Custom image component for ReactMarkdown (0158)
  const markdownComponents: Components = useMemo(() => {
    // Create a wrapper that captures the current artifact and handler
    const artifactTitle = artifact?.title
    const imageClickHandler = handleImageClick
    const bodyMd = artifact?.body_md || ''
    
    const ImageComponent = (props: any) => {
      // ReactMarkdown v10 passes node-based props
      // However, data URLs are being sanitized and node.properties.src is empty
      // We need to extract the URL from the raw markdown using the node position
      const node = props.node
      const alt = node?.properties?.alt || node?.alt || props.alt || null
      
      // If src is empty, try to extract from raw markdown using position
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
          onImageClick={imageClickHandler}
        />
      )
    }
    
    return {
      img: ImageComponent,
    }
  }, [artifact?.title, artifact?.body_md, handleImageClick, artifact])

  // Check if this is a git-diff artifact
  const isGitDiff = useMemo(() => {
    if (!artifact) return false
    const normalizedTitle = artifact.title?.toLowerCase().trim() || ''
    return normalizedTitle.startsWith('git diff for ticket') || normalizedTitle.startsWith('git-diff for ticket')
  }, [artifact])

  // Calculate navigation state (0148) - must be called before any early returns
  // Sort artifacts chronologically (oldest first)
  // If artifacts array is empty but we have an artifact, use it as the only item
  const sortedArtifacts = useMemo(() => {
    if (artifacts.length === 0 && artifact) {
      // Fallback: if artifacts array is empty but we have an artifact, use it
      return [artifact]
    }
    return [...artifacts].sort((a, b) => {
      const timeA = new Date(a.created_at || 0).getTime()
      const timeB = new Date(b.created_at || 0).getTime()
      if (timeA !== timeB) {
        return timeA - timeB
      }
      // Secondary sort by artifact_id for deterministic ordering when timestamps are equal (0147)
      return (a.artifact_id || '').localeCompare(b.artifact_id || '')
    })
  }, [artifacts, artifact])
  
  // Find the actual index of the current artifact in the sorted list
  const actualIndex = useMemo(() => {
    if (!artifact || !artifact.artifact_id) return -1
    return sortedArtifacts.findIndex(a => a.artifact_id === artifact.artifact_id)
  }, [sortedArtifacts, artifact])
  
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
              className="artifact-nav-button artifact-nav-previous"
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
              className="artifact-nav-button artifact-nav-next"
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

/** Human validation section component (0085) */
// HumanValidationSection extracted to components/HumanValidationSection.tsx

// ProcessReviewSection extracted to components/ProcessReviewSection.tsx

// ArtifactsSection extracted to components/ArtifactsSection.tsx

// AttachmentsSection extracted to components/AttachmentsSection.tsx

// QAInfoSection extracted to components/QAInfoSection.tsx
// TicketDetailModal extracted to components/TicketDetailModal.tsx

export function SortableCard({
  card,
  columnId,
  onOpenDetail,
  activeWorkAgentType,
  isSaving = false,
}: {
  card: Card
  columnId: string
  onOpenDetail?: (cardId: string) => void
  activeWorkAgentType?: 'Implementation' | 'QA' | null
  isSaving?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: 'card', columnId },
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : isSaving ? 0.7 : 1,
  }
  const handleCardClick = () => {
    if (onOpenDetail) onOpenDetail(card.id)
  }
  // Show badge for Doing column tickets: use activeWorkAgentType (set from source column) or "Unassigned" (0135)
  const showAgentBadge = columnId === 'col-doing'
  // Use activeWorkAgentType from state (set based on source column) instead of database lookup (0135)
  const agentName = activeWorkAgentType || null
  const badgeText = agentName || 'Unassigned'
  const badgeTitle = agentName ? `Working: ${agentName} Agent` : 'No agent currently working'
  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={`ticket-card ${isSaving ? 'ticket-card-saving' : ''}`} 
      data-card-id={card.id}
      aria-busy={isSaving}
    >
      <div className="ticket-card-top-row">
        <span
          className="ticket-card-drag-handle"
          {...attributes}
          {...listeners}
          aria-label="Drag to move"
          title="Drag to move"
        />
        <button
          type="button"
          className="ticket-card-click-area"
          onClick={handleCardClick}
          aria-label={`Open ticket ${card.id}: ${card.title}`}
          disabled={isSaving}
        >
          <span className="ticket-card-title">{card.title}</span>
          {isSaving && (
            <span className="ticket-card-saving-indicator" aria-label="Saving" title="Saving...">
              <span className="ticket-card-saving-spinner"></span>
            </span>
          )}
        </button>
      </div>
      {showAgentBadge && (
        <span className="ticket-card-agent-badge" title={badgeTitle}>
          {badgeText}
        </span>
      )}
    </div>
  )
}


/** Draggable Supabase ticket list item (0013): id is ticket id for DnD. */
function _DraggableSupabaseTicketItem({
  row,
  onClick,
  isSelected,
}: {
  row: SupabaseTicketRow
  onClick: () => void
  isSelected: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: row.pk,
    data: { type: 'supabase-ticket-from-list', id: row.pk },
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  }
  const displayId = row.display_id ?? row.id
  const cleanTitle = row.title.replace(/^(?:[A-Za-z0-9]{2,10}-)?\d{4}\s*[—–-]\s*/, '')
  return (
    <li ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <button
        type="button"
        className="ticket-file-btn"
        onClick={(e) => {
          e.stopPropagation()
          onClick()
        }}
        aria-pressed={isSelected}
      >
        {displayId} — {cleanTitle}
      </button>
    </li>
  )
}

/** Get workflow steps for an agent type (0203) */
function getAgentWorkflowSteps(agentType: 'implementation' | 'qa' | null): Array<{ id: string; label: string }> {
  if (agentType === 'qa') {
    return [
      { id: 'preparing', label: 'Preparing' },
      { id: 'fetching_ticket', label: 'Fetching ticket' },
      { id: 'fetching_branch', label: 'Finding branch' },
      { id: 'launching', label: 'Launching QA' },
      { id: 'polling', label: 'Reviewing' },
      { id: 'generating_report', label: 'Generating report' },
      { id: 'merging', label: 'Merging' },
      { id: 'moving_ticket', label: 'Moving ticket' },
      { id: 'completed', label: 'Completed' },
    ]
  } else if (agentType === 'implementation') {
    return [
      { id: 'preparing', label: 'Preparing' },
      { id: 'fetching_ticket', label: 'Fetching ticket' },
      { id: 'resolving_repo', label: 'Resolving repo' },
      { id: 'launching', label: 'Launching agent' },
      { id: 'polling', label: 'Running' },
      { id: 'completed', label: 'Completed' },
    ]
  }
  return []
}

/** Map database status to workflow step ID (0203) */
function mapStatusToStepId(status: string, agentType: 'implementation' | 'qa' | null): string {
  // Map database statuses to workflow steps
  // Database has: 'created' | 'launching' | 'polling' | 'finished' | 'failed'
  if (status === 'failed') return 'failed'
  if (status === 'finished') return 'completed'
  
  if (agentType === 'qa') {
    // For QA, map database status to workflow step
    // Note: 'polling' in database could mean Reviewing, Generating report, Merging, or Moving ticket
    // We'll show it as 'polling' (Reviewing) since that's the first polling step
    if (status === 'created') return 'fetching_ticket'
    if (status === 'launching') return 'launching'
    if (status === 'polling') return 'polling'
    return 'preparing'
  } else if (agentType === 'implementation') {
    if (status === 'created') return 'fetching_ticket'
    if (status === 'launching') return 'launching'
    if (status === 'polling') return 'polling'
    return 'preparing'
  }
  return 'preparing'
}

/** Determine step status: 'done' | 'active' | 'pending' (0203) */
function getStepStatus(
  stepId: string,
  currentStepId: string,
  workflowSteps: Array<{ id: string; label: string }>
): 'done' | 'active' | 'pending' {
  // Handle failed status - all steps before completed are done, completed step shows as active (will be styled as failed in tooltip)
  if (currentStepId === 'failed') {
    const completedIndex = workflowSteps.findIndex(s => s.id === 'completed')
    const stepIndex = workflowSteps.findIndex(s => s.id === stepId)
    if (stepIndex === -1) return 'pending'
    if (stepIndex < completedIndex) return 'done'
    if (stepId === 'completed') return 'active' // Show completed step as active when failed (will be styled red in tooltip)
    return 'pending'
  }
  
  const currentIndex = workflowSteps.findIndex(s => s.id === currentStepId)
  const stepIndex = workflowSteps.findIndex(s => s.id === stepId)
  
  if (currentIndex === -1 || stepIndex === -1) return 'pending'
  if (stepIndex < currentIndex) return 'done'
  if (stepIndex === currentIndex) return 'active'
  return 'pending'
}

/** Multi-dot status indicator component with tooltip (0203) */
function StatusIndicator({
  agentRun,
  agentName,
}: {
  agentRun?: SupabaseAgentRunRow
  agentName: string | null
}) {
  const [isHovered, setIsHovered] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const indicatorRef = useRef<HTMLDivElement>(null)

  // Determine agent type from agentRun or agentName
  const agentType: 'implementation' | 'qa' | null = agentRun?.agent_type || 
    (agentName === 'QA' ? 'qa' : agentName === 'Implementation' ? 'implementation' : null)
  
  // Get workflow steps for this agent type
  const workflowSteps = getAgentWorkflowSteps(agentType)
  
  // Map current status to step ID
  const currentStepId = agentRun ? mapStatusToStepId(agentRun.status, agentType) : null
  
  const showTooltip = isHovered || isFocused

  // Position tooltip to avoid clipping - ensures full visibility in all scenarios
  useEffect(() => {
    if (showTooltip && tooltipRef.current && indicatorRef.current) {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        if (!tooltipRef.current || !indicatorRef.current) return
        
        const tooltip = tooltipRef.current
        const indicator = indicatorRef.current
        const wrapper = indicator.closest('.active-work-status-indicator-wrapper') as HTMLElement
        if (!wrapper) return
        
        // Reset positioning to default (below, left-aligned) for accurate measurement
        tooltip.style.top = '100%'
        tooltip.style.bottom = 'auto'
        tooltip.style.left = '0'
        tooltip.style.right = 'auto'
        tooltip.style.marginTop = '4px'
        tooltip.style.marginBottom = '0'
        tooltip.style.transform = 'none'
        
        // Get bounding rects after reset (all in viewport coordinates)
        const indicatorRect = indicator.getBoundingClientRect()
        const tooltipRect = tooltip.getBoundingClientRect()
        const wrapperRect = wrapper.getBoundingClientRect()
        
        // Get viewport dimensions
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        
        // Find the closest scrollable container (active-work-item, active-work-items, or document)
        let container = indicator.closest('.active-work-item') || indicator.closest('.active-work-items')
        let containerRect: DOMRect | null = null
        if (container) {
          containerRect = container.getBoundingClientRect()
        }
        
        // Use container boundaries if available, otherwise use viewport
        const maxRight = containerRect ? containerRect.right : viewportWidth
        const maxBottom = containerRect ? containerRect.bottom : viewportHeight
        const minLeft = containerRect ? containerRect.left : 0
        const minTop = containerRect ? containerRect.top : 0
        
        // Calculate tooltip position when positioned below (default)
        const spaceBelow = maxBottom - indicatorRect.bottom - 4
        const spaceAbove = indicatorRect.top - minTop - 4
        
        // Vertical positioning: prefer below, flip above if needed
        if (spaceBelow < tooltipRect.height && spaceAbove >= tooltipRect.height) {
          // Not enough space below, but enough above - position above
          tooltip.style.top = 'auto'
          tooltip.style.bottom = '100%'
          tooltip.style.marginBottom = '4px'
          tooltip.style.marginTop = '0'
        } else if (spaceBelow < tooltipRect.height && spaceAbove < tooltipRect.height) {
          // Not enough space in either direction - use the side with more space
          if (spaceAbove > spaceBelow) {
            tooltip.style.top = 'auto'
            tooltip.style.bottom = '100%'
            tooltip.style.marginBottom = '4px'
            tooltip.style.marginTop = '0'
          } else {
            tooltip.style.top = '100%'
            tooltip.style.bottom = 'auto'
            tooltip.style.marginTop = '4px'
            tooltip.style.marginBottom = '0'
          }
        } else {
          // Enough space below, use default
          tooltip.style.top = '100%'
          tooltip.style.bottom = 'auto'
          tooltip.style.marginTop = '4px'
          tooltip.style.marginBottom = '0'
        }
        
        // Re-measure after vertical positioning
        const finalTooltipRect = tooltip.getBoundingClientRect()
        const tooltipLeftX = finalTooltipRect.left
        const tooltipRightX = finalTooltipRect.right
        
        // Calculate horizontal offset relative to wrapper
        // tooltip.style.left is relative to wrapper, so we need to convert viewport coordinates
        const wrapperLeft = wrapperRect.left
        
        // Horizontal positioning: ensure tooltip doesn't clip on left or right
        if (tooltipRightX > maxRight) {
          // Tooltip extends beyond right edge - align to right of wrapper or adjust
          // Try aligning to right of wrapper
          tooltip.style.left = 'auto'
          tooltip.style.right = '0'
          // Re-measure
          const adjustedRect = tooltip.getBoundingClientRect()
          if (adjustedRect.left < minLeft) {
            // Still extends beyond left, position to fit within container
            // Calculate left offset: minLeft - wrapperLeft (convert viewport to wrapper-relative)
            const leftOffset = minLeft - wrapperLeft
            tooltip.style.left = `${leftOffset}px`
            tooltip.style.right = 'auto'
          }
        } else if (tooltipLeftX < minLeft) {
          // Tooltip extends beyond left edge - align to left of container
          // Calculate left offset: minLeft - wrapperLeft (convert viewport to wrapper-relative)
          const leftOffset = minLeft - wrapperLeft
          tooltip.style.left = `${leftOffset}px`
          tooltip.style.right = 'auto'
        } else {
          // Default: left-aligned with wrapper (which aligns with indicator)
          tooltip.style.left = '0'
          tooltip.style.right = 'auto'
        }
      })
    }
  }, [showTooltip])

  // If no agent run or no workflow steps, show unassigned state
  if (!agentRun || workflowSteps.length === 0) {
    return (
      <div
        className="active-work-status-indicator-wrapper"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div
          ref={indicatorRef}
          className="active-work-status-indicator"
          tabIndex={0}
          role="button"
          aria-label="Status: Unassigned"
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        >
          <span className="status-dot status-dot-pending" />
        </div>
        {showTooltip && (
          <div
            ref={tooltipRef}
            className="active-work-status-tooltip"
            role="tooltip"
          >
            <div className="active-work-status-tooltip-header">
              <span className="active-work-status-tooltip-label">Status:</span>
              <span className="active-work-status-tooltip-value status-value-unassigned">
                Unassigned
              </span>
            </div>
            <div className="active-work-status-tooltip-description">
              No agent is currently working on this ticket.
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className="active-work-status-indicator-wrapper"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        ref={indicatorRef}
        className="active-work-status-indicator"
        tabIndex={0}
        role="button"
        aria-label={`Status: ${workflowSteps.find(s => s.id === currentStepId)?.label || 'Unknown'}`}
        aria-describedby={showTooltip ? `status-tooltip-${agentRun.run_id}` : undefined}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      >
        {workflowSteps.map((step) => {
          const stepStatus = getStepStatus(step.id, currentStepId || 'preparing', workflowSteps)
          return (
            <span
              key={step.id}
              className={`status-dot status-dot-${stepStatus}`}
              aria-label={step.label}
            />
          )
        })}
      </div>
      {showTooltip && (
        <div
          ref={tooltipRef}
          id={`status-tooltip-${agentRun.run_id}`}
          className="active-work-status-tooltip active-work-status-timeline-tooltip"
          role="tooltip"
        >
          <div className="impl-agent-status-timeline" role="status">
            {workflowSteps.map((step, index) => {
              const stepStatus = getStepStatus(step.id, currentStepId || 'preparing', workflowSteps)
              const isLast = index === workflowSteps.length - 1
              const isFailed = currentStepId === 'failed' && step.id === 'completed'
              return (
                <React.Fragment key={step.id}>
                  <span
                    className={
                      isFailed
                        ? 'impl-status-failed'
                        : stepStatus === 'active'
                        ? 'impl-status-active'
                        : stepStatus === 'done'
                        ? 'impl-status-done'
                        : ''
                    }
                  >
                    {isFailed ? 'Failed' : step.label}
                  </span>
                  {!isLast && <span className="impl-status-arrow">→</span>}
                </React.Fragment>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function App() {
  const [debugOpen, setDebugOpen] = useState(false)
  const [actionLog, setActionLog] = useState<LogEntry[]>([])
  const addLog = useCallback((message: string) => {
    const at = formatTime()
    const id = Date.now()
    setActionLog((prev) => [...prev.slice(-19), { id, message, at }])
  }, [])
  const [runtimeError, _setRuntimeError] = useState<string | null>(null)
  const [columns] = useState<Column[]>(() => EMPTY_KANBAN_COLUMNS)
  const [cards] = useState<Record<string, Card>>({})
  const [showAddColumnForm, setShowAddColumnForm] = useState(false)
  const [newColumnTitle, setNewColumnTitle] = useState('')
  const [addColumnError, setAddColumnError] = useState<string | null>(null)
  const [activeCardId, setActiveCardId] = useState<UniqueIdentifier | null>(null)
  const lastOverId = useRef<UniqueIdentifier | null>(null)

  // File system mode removed: Supabase-only (0065)

  // When provided, we're embedded as a library in HAL (no iframe); use props instead of postMessage
  const halCtx = useContext(HalKanbanContext)

  // Project folder and connection state
  const [projectFolderHandle, setProjectFolderHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [projectName, setProjectName] = useState<string | null>(null)
  const [connectError, setConnectError] = useState<string | null>(null)
  
  // Embedded: in iframe (postMessage) or as library (halCtx provided)
  const isEmbedded = (typeof window !== 'undefined' && window.self !== window.top) || halCtx != null

  // New HAL project wizard (v0 checklist-only)
  const [newHalWizardOpen, setNewHalWizardOpen] = useState(false)
  const [newHalProjectName, setNewHalProjectName] = useState('')
  const [newHalRepoUrl, setNewHalRepoUrl] = useState('')
  const [newHalChecklist, setNewHalChecklist] = useState({
    createdRepo: false,
    copiedScaffold: false,
    setEnv: false,
    addedToHalSuperProject: false,
  })
  const [newHalReport, setNewHalReport] = useState<string | null>(null)
  const [newHalTemplateRoot, setNewHalTemplateRoot] = useState<FileSystemDirectoryHandle | null>(null)
  const [newHalTargetRoot, setNewHalTargetRoot] = useState<FileSystemDirectoryHandle | null>(null)
  const [newHalBootstrapLog, setNewHalBootstrapLog] = useState<string | null>(null)
  const [newHalBootstrapError, setNewHalBootstrapError] = useState<string | null>(null)
  // Supabase (read-only v0)
  const [supabaseProjectUrl, setSupabaseProjectUrl] = useState('')
  const [supabaseAnonKey, setSupabaseAnonKey] = useState('')
  const [connectedRepoFullName, setConnectedRepoFullName] = useState<string | null>(null)
  const [supabaseConnectionStatus, setSupabaseConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected')
  const [supabaseLastError, setSupabaseLastError] = useState<string | null>(null)

  // Restore Supabase url/key to state only on mount (no auto-connect). Ensures key is in state when HAL sends HAL_CONNECT_SUPABASE; avoids showing tickets before user has connected this session.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SUPABASE_CONFIG_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as { projectUrl?: string; anonKey?: string }
      const url = (parsed?.projectUrl ?? '').trim()
      const key = (parsed?.anonKey ?? '').trim()
      if (url && key) {
        setSupabaseProjectUrl(url)
        setSupabaseAnonKey(key)
      }
    } catch {
      // ignore
    }
  }, [])

  // Restore connected repo from localStorage on load (0119: fix repo display after refresh)
  useEffect(() => {
    if (halCtx) return // library mode: repo comes from context
    try {
      const saved = localStorage.getItem(CONNECTED_REPO_KEY)
      if (saved && saved.trim()) {
        setConnectedRepoFullName(saved.trim())
        setProjectName(saved.trim())
      }
    } catch {
      // ignore localStorage errors
    }
  }, [halCtx])

  // Library mode: apply theme (HAL owns all data; no credentials in context)
  useEffect(() => {
    if (halCtx?.theme) {
      document.documentElement.setAttribute('data-theme', halCtx.theme)
    }
  }, [halCtx?.theme])

  const [supabaseTickets, setSupabaseTickets] = useState<SupabaseTicketRow[]>([])
  // Ref to always get latest tickets in fetchActiveAgentRuns (0135) - prevents stale closure values
  const supabaseTicketsRef = useRef<SupabaseTicketRow[]>([])
  const [supabaseColumnsRows, setSupabaseColumnsRows] = useState<SupabaseKanbanColumnRow[]>([])
  const [supabaseLastRefresh, setSupabaseLastRefresh] = useState<Date | null>(null)
  const [supabaseColumnsLastRefresh, setSupabaseColumnsLastRefresh] = useState<Date | null>(null)
  const [supabaseColumnsLastError, setSupabaseColumnsLastError] = useState<string | null>(null)
  const [supabaseColumnsJustInitialized, setSupabaseColumnsJustInitialized] = useState(false)
  const [_supabaseNotInitialized, setSupabaseNotInitialized] = useState(false)
  const [_selectedSupabaseTicketId, setSelectedSupabaseTicketId] = useState<string | null>(null)
  const [_selectedSupabaseTicketContent, setSelectedSupabaseTicketContent] = useState<string | null>(null)
  // Agent runs for Doing column tickets (0114) - kept for compatibility but not used for badges (0135)
  const [agentRunsByTicketPk, setAgentRunsByTicketPk] = useState<Record<string, SupabaseAgentRunRow>>({})
  // Agent type labels for Active work section (0135) - simple string storage based on source column, no DB
  const [activeWorkAgentTypes, setActiveWorkAgentTypes] = useState<Record<string, 'Implementation' | 'QA'>>({})
  // Sync with Docs removed (Supabase-only) (0065)
  // Ticket persistence tracking (0047)
  const [lastMovePersisted, setLastMovePersisted] = useState<{ success: boolean; timestamp: Date; ticketId: string; error?: string } | null>(null)
  const [pendingMoves, setPendingMoves] = useState<Set<string>>(new Set())

  // Ticket detail modal (0033): click card opens modal; content from Supabase or docs
  const [detailModal, setDetailModal] = useState<{ ticketId: string; title: string; columnId: string | null } | null>(null)
  const [detailModalBody, setDetailModalBody] = useState<string | null>(null)
  const [detailModalError, setDetailModalError] = useState<string | null>(null)
  const [detailModalLoading, setDetailModalLoading] = useState(false)
  const [detailModalRetryTrigger, setDetailModalRetryTrigger] = useState(0)
  
  // Agent artifacts (0082)
  const [detailModalArtifacts, setDetailModalArtifacts] = useState<SupabaseAgentArtifactRow[]>([])
  const [detailModalArtifactsLoading, setDetailModalArtifactsLoading] = useState(false)
  const [detailModalArtifactsStatus, setDetailModalArtifactsStatus] = useState<string | null>(null)
  const [artifactViewer, setArtifactViewer] = useState<SupabaseAgentArtifactRow | null>(null)
  const [artifactViewerIndex, setArtifactViewerIndex] = useState<number>(0)
  
  // Ticket attachments (0092)
  const [detailModalAttachments, setDetailModalAttachments] = useState<TicketAttachment[]>([])
  const [detailModalAttachmentsLoading, setDetailModalAttachmentsLoading] = useState(false)
  const [detailModalFailureCounts, setDetailModalFailureCounts] = useState<{ qa: number; hitl: number } | null>(null)
  
  // Board data: library mode (halCtx) = HAL passes data down; else = we fetch from Supabase (iframe/standalone)
  const sourceTickets = halCtx?.tickets ?? supabaseTickets
  const sourceColumnsRows = halCtx?.columns ?? supabaseColumnsRows
  const supabaseBoardActive = !!halCtx || supabaseConnectionStatus === 'connected'
  const { columns: supabaseColumns, unknownColumnTicketIds: supabaseUnknownColumnTicketIds } = useMemo(() => {
    if (!supabaseBoardActive || sourceColumnsRows.length === 0) {
      return { columns: EMPTY_KANBAN_COLUMNS, unknownColumnTicketIds: [] as string[] }
    }
    const columnIds = new Set(sourceColumnsRows.map((c) => c.id))
    const firstColumnId = sourceColumnsRows[0].id
    const byColumn: Record<string, { id: string; position: number }[]> = {}
    for (const c of sourceColumnsRows) {
      byColumn[c.id] = []
    }
    const unknownIds: string[] = []
    for (const t of sourceTickets) {
      const colId =
        t.kanban_column_id == null || t.kanban_column_id === ''
          ? firstColumnId
          : columnIds.has(t.kanban_column_id)
            ? t.kanban_column_id
            : (unknownIds.push(t.pk), firstColumnId)
      const pos = typeof t.kanban_position === 'number' ? t.kanban_position : 0
      byColumn[colId].push({ id: t.pk, position: pos })
    }
    for (const id of Object.keys(byColumn)) {
      byColumn[id].sort((a, b) => a.position - b.position)
    }
    const columns: Column[] = sourceColumnsRows.map((c) => ({
      id: c.id,
      title: c.title,
      cardIds: byColumn[c.id]?.map((x) => x.id) ?? [],
    }))
    return { columns, unknownColumnTicketIds: unknownIds }
  }, [supabaseBoardActive, sourceColumnsRows, sourceTickets])
  const supabaseCards = useMemo(() => {
    const map: Record<string, Card> = {}
    for (const t of sourceTickets) {
      const cleanTitle = t.title.replace(/^(?:[A-Za-z0-9]{2,10}-)?\d{4}\s*[—–-]\s*/, '')
      const display = t.display_id ? `${t.display_id} — ${cleanTitle}` : t.title
      const displayId = (t.display_id ?? (t.id ? String(t.id).padStart(4, '0') : undefined)) ?? undefined
      map[t.pk] = { id: t.pk, title: display, displayId }
    }
    return map
  }, [sourceTickets])

  /** Connect to Supabase with given url/key; sets status, tickets, errors. */
  const connectSupabase = useCallback(async (url: string, key: string) => {
    setSupabaseLastError(null)
    setSupabaseNotInitialized(false)
    const u = url?.trim()
    const k = key?.trim()
    if (!u || !k) {
      setSupabaseLastError('Supabase project URL and anon key are required. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env (or in Vercel env for production).')
      return
    }
    setSupabaseConnectionStatus('connecting')
    try {
      const client = createClient(u, k)
      const { error: testError } = await client.from('tickets').select('id').limit(1)
      if (testError) {
        const code = (testError as { code?: string }).code
        const msg = testError.message ?? String(testError)
        const lower = msg.toLowerCase()
        if (lower.includes('no api key') || lower.includes('apikey')) {
          setSupabaseLastError('Supabase anon key missing or invalid. Set VITE_SUPABASE_ANON_KEY in .env (or in Vercel env for production) and reconnect.')
          setSupabaseConnectionStatus('disconnected')
          setSupabaseTickets([])
          setSupabaseColumnsRows([])
          return
        }
        const isTableMissing =
          code === '42P01' ||
          lower.includes('relation') ||
          lower.includes('does not exist') ||
          lower.includes('schema cache') ||
          lower.includes('could not find the table')
        if (isTableMissing) {
          setSupabaseNotInitialized(true)
          setSupabaseLastError('Supabase not initialized (tickets table missing).')
        } else {
          setSupabaseLastError(msg)
        }
        setSupabaseConnectionStatus('disconnected')
        setSupabaseTickets([])
        setSupabaseColumnsRows([])
        return
      }
      // Repo-scoped schema (0079). If columns don't exist yet, show a clear migration error.
      let rows: unknown[] | null = null
      let error: { code?: string; message?: string } | null = null
      if (connectedRepoFullName) {
        const r = await client
          .from('tickets')
          .select('pk, id, repo_full_name, ticket_number, display_id, filename, title, body_md, kanban_column_id, kanban_position, kanban_moved_at, updated_at')
          .eq('repo_full_name', connectedRepoFullName)
          .order('ticket_number', { ascending: true })
        rows = (r.data ?? null) as unknown[] | null
        error = (r.error as typeof error) ?? null
      } else {
        // No repo connected: show no tickets (repo-scoped 0079)
        rows = []
        error = null
      }
      if (error) {
        const eAny = error as any
        const msg = eAny?.message ?? String(error)
        const looksLikeOldSchema =
          eAny?.code === '42703' ||
          (msg.toLowerCase().includes('column') && msg.toLowerCase().includes('does not exist'))
        setSupabaseLastError(
          looksLikeOldSchema
            ? 'Supabase schema needs migration for repo-scoped tickets (0079). Run docs/process/supabase-migrations/0079-repo-scoped-tickets.sql'
            : msg
        )
        setSupabaseConnectionStatus('disconnected')
        setSupabaseTickets([])
        setSupabaseColumnsRows([])
        return
      }
      setSupabaseTickets(((rows ?? []) as any[]).map((r) => normalizeTicketRow(r)))

      // Fetch kanban_columns (0020); init defaults if empty
      setSupabaseColumnsLastError(null)
      const { data: colRows, error: colError } = await client
        .from('kanban_columns')
        .select('id, title, position, created_at, updated_at')
        .order('position', { ascending: true })
      if (colError) {
        const eAny = colError as any
        const code = eAny?.code as string | undefined
        const msg = (eAny?.message as string | undefined) ?? String(colError)
        const lower = msg.toLowerCase()
        const isTableMissing =
          code === '42P01' ||
          lower.includes('relation') ||
          lower.includes('does not exist') ||
          lower.includes('could not find')
        if (isTableMissing) {
          setSupabaseColumnsLastError('kanban_columns table missing. Run: ' + _SUPABASE_KANBAN_COLUMNS_SETUP_SQL.slice(0, 80) + '...')
          setSupabaseLastError('Supabase schema incomplete (kanban_columns table missing).')
        } else {
          setSupabaseColumnsLastError(msg)
        }
        setSupabaseConnectionStatus('disconnected')
        setSupabaseTickets([])
        setSupabaseColumnsRows([])
        return
      }
      let finalColRows = (colRows ?? []) as SupabaseKanbanColumnRow[]
      if (finalColRows.length === 0) {
        for (const seed of DEFAULT_KANBAN_COLUMNS_SEED) {
          const { error: insErr } = await client.from('kanban_columns').insert(seed)
          if (insErr) {
            setSupabaseColumnsLastError(insErr.message ?? String(insErr))
            setSupabaseLastError('Failed to initialize default columns: ' + (insErr.message ?? String(insErr)))
            setSupabaseConnectionStatus('disconnected')
            setSupabaseTickets([])
            setSupabaseColumnsRows([])
            return
          }
        }
        const { data: afterRows } = await client
          .from('kanban_columns')
          .select('id, title, position, created_at, updated_at')
          .order('position', { ascending: true })
        finalColRows = (afterRows ?? []) as SupabaseKanbanColumnRow[]
        setSupabaseColumnsJustInitialized(true)
      } else {
        // Migration: add missing columns for existing DBs (col-qa, col-human-in-the-loop, col-process-review, col-wont-implement)
        const ids = new Set(finalColRows.map((c) => c.id))
        const toInsert: { id: string; title: string; position: number }[] = []
        if (!ids.has('col-qa')) {
          toInsert.push({ id: 'col-qa', title: 'QA', position: -1 })
        }
        if (!ids.has('col-human-in-the-loop')) {
          toInsert.push({ id: 'col-human-in-the-loop', title: 'Human in the Loop', position: -1 })
        }
        if (!ids.has('col-process-review')) {
          toInsert.push({ id: 'col-process-review', title: 'Process Review', position: -1 })
        }
        if (!ids.has('col-wont-implement')) {
          toInsert.push({ id: 'col-wont-implement', title: 'Will Not Implement', position: -1 })
        }
        if (toInsert.length > 0) {
          const maxPosition = Math.max(...finalColRows.map((c) => c.position), -1)
          for (let i = 0; i < toInsert.length; i++) {
            toInsert[i].position = maxPosition + 1 + i
          }
          for (const row of toInsert) {
            const { error: insErr } = await client.from('kanban_columns').insert(row)
            if (!insErr) {
              finalColRows = [...finalColRows, row as SupabaseKanbanColumnRow]
            }
          }
          finalColRows.sort((a, b) => a.position - b.position)
          const { data: afterRows } = await client
            .from('kanban_columns')
            .select('id, title, position, created_at, updated_at')
            .order('position', { ascending: true })
          if (afterRows?.length) finalColRows = afterRows as SupabaseKanbanColumnRow[]
        }
      }

      setSupabaseColumnsRows(canonicalizeColumnRows(finalColRows))
      setSupabaseColumnsLastRefresh(new Date())
      setSupabaseLastRefresh(new Date())
      setSupabaseConnectionStatus('connected')
      setSupabaseProjectUrl(url)
      setSupabaseAnonKey(key)
      localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify({ projectUrl: url, anonKey: key }))
    } catch (e) {
      setSupabaseLastError(e instanceof Error ? e.message : String(e))
      setSupabaseConnectionStatus('disconnected')
      setSupabaseTickets([])
      setSupabaseColumnsRows([])
    }
  }, [])

  /** Connect to project folder: pick folder, read .env, connect to Supabase */
  const handleConnectProjectFolder = useCallback(async () => {
    setConnectError(null)
    if (typeof window.showDirectoryPicker !== 'function') {
      setConnectError('Folder picker not supported in this browser.')
      return
    }
    try {
      const folderHandle = await window.showDirectoryPicker({ mode: 'read' })
      setProjectFolderHandle(folderHandle)
      setProjectName(folderHandle.name)
      
      // Read .env file
      let envFile: FileSystemFileHandle
      try {
        envFile = await folderHandle.getFileHandle('.env')
      } catch {
        setConnectError('No .env file found in selected folder.')
        return
      }
      
      const file = await envFile.getFile()
      const envText = await file.text()
      
      // Parse .env for VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
      const urlMatch = envText.match(/^VITE_SUPABASE_URL\s*=\s*(.+)$/m)
      const keyMatch = envText.match(/^VITE_SUPABASE_ANON_KEY\s*=\s*(.+)$/m)
      
      if (!urlMatch || !keyMatch) {
        setConnectError('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env file.')
        return
      }
      
      const url = urlMatch[1].trim()
      const key = keyMatch[1].trim()
      
      // Connect to Supabase with credentials from .env
      await connectSupabase(url, key)
      
    } catch (e) {
      const err = e as { name?: string }
      if (err.name === 'AbortError') {
        return
      }
      setConnectError(err instanceof Error ? err.message : 'Failed to connect to project folder.')
    }
  }, [connectSupabase])

  // Supabase-only mode (0065): always use Supabase when connected, otherwise empty
  // Filter out 'col-doing' - it's now shown in Active work row above the board (0145)
  const allColumns = supabaseBoardActive ? supabaseColumns : columns
  const columnsForDisplay = allColumns.filter((c) => c.id !== 'col-doing')
  const cardsForDisplay = supabaseBoardActive ? supabaseCards : cards
  
  // Get tickets in Doing column for Active work row (0145)
  // Use sourceTickets (halCtx.tickets in library mode, supabaseTickets in standalone) so it works in both modes
  const doingTickets = supabaseBoardActive
    ? sourceTickets.filter((t) => t.kanban_column_id === 'col-doing').sort((a, b) => {
        // Sort by position, then by moved_at timestamp
        if (a.kanban_position !== null && b.kanban_position !== null) {
          return a.kanban_position - b.kanban_position
        }
        if (a.kanban_position !== null) return -1
        if (b.kanban_position !== null) return 1
        // Both null position - sort by moved_at (newer first)
        if (a.kanban_moved_at && b.kanban_moved_at) {
          return new Date(b.kanban_moved_at).getTime() - new Date(a.kanban_moved_at).getTime()
        }
        if (a.kanban_moved_at) return -1
        if (b.kanban_moved_at) return 1
        return 0
      })
    : []

  /** Fetch artifacts for a ticket (0082) */
  const fetchTicketArtifacts = useCallback(
    async (ticketPk: string): Promise<SupabaseAgentArtifactRow[]> => {
      const url = supabaseProjectUrl.trim()
      const key = supabaseAnonKey.trim()
      if (!url || !key) return []
      try {
        const client = createClient(url, key)
        const { data, error } = await client
          .from('agent_artifacts')
          .select('artifact_id, ticket_pk, repo_full_name, agent_type, title, body_md, created_at, updated_at')
          .eq('ticket_pk', ticketPk)
          .order('created_at', { ascending: true })
          .order('artifact_id', { ascending: true })
        if (error) {
          console.warn('Failed to fetch artifacts:', error)
          return []
        }
        return (data ?? []) as SupabaseAgentArtifactRow[]
      } catch (e) {
        console.warn('Failed to fetch artifacts:', e)
        return []
      }
    },
    [supabaseProjectUrl, supabaseAnonKey]
  )

  /** Fetch ticket attachments (0092) */
  const fetchTicketAttachments = useCallback(
    async (ticketId: string): Promise<TicketAttachment[]> => {
      const url = supabaseProjectUrl.trim()
      const key = supabaseAnonKey.trim()
      if (!url || !key) return []
      try {
        const client = createClient(url, key)
        const { data, error } = await client
          .from('ticket_attachments')
          .select('pk, ticket_pk, ticket_id, filename, mime_type, data_url, file_size, created_at')
          .eq('ticket_id', ticketId)
          .order('created_at', { ascending: false })
        if (error) {
          console.warn('Failed to fetch ticket attachments:', error)
          return []
        }
        return (data ?? []) as TicketAttachment[]
      } catch (e) {
        console.warn('Failed to fetch ticket attachments:', e)
        return []
      }
    },
    [supabaseProjectUrl, supabaseAnonKey]
  )

  /** Fetch active agent runs for tickets in Doing column (0114) */
  const fetchActiveAgentRuns = useCallback(async (freshTickets?: SupabaseTicketRow[]) => {
    const url = supabaseProjectUrl.trim()
    const key = supabaseAnonKey.trim()
    if (!url || !key || !connectedRepoFullName) return
    try {
      const client = createClient(url, key)
      // CRITICAL FIX (0135): Always use the latest state, not stale freshTickets
      // When called after a move, freshTickets might be from before the optimistic update
      // Use functional state update to read the current state, which includes optimistic updates
      
      // Get all tickets in Doing column from current state
      setAgentRunsByTicketPk((prevRuns) => {
        // CRITICAL FIX (0135): Read current state to get tickets with optimistic updates
        // This ensures we use the actual current state, not stale data
        const currentTickets = freshTickets ?? supabaseTicketsRef.current
        const doingTickets = currentTickets.filter((t) => t.kanban_column_id === 'col-doing')
        const ticketPkSet = new Set(doingTickets.map((t) => t.pk))
        
        // Immediately clear runs for tickets that are no longer in Doing (0135)
        // This prevents stale badges from showing while the fetch is in progress
        const cleanedRuns: Record<string, SupabaseAgentRunRow> = {}
        for (const [ticketPk, run] of Object.entries(prevRuns)) {
          if (ticketPkSet.has(ticketPk)) {
            cleanedRuns[ticketPk] = run
          }
        }
        
        // Return cleaned state immediately to clear stale runs
        return cleanedRuns
      })
      
      // CRITICAL FIX (0135): Re-read current state after clearing to ensure we have latest tickets
      // This handles the case where state was updated between the setState call and now
      const currentTicketsAfterClear = freshTickets ?? supabaseTicketsRef.current
      const doingTickets = currentTicketsAfterClear.filter((t) => t.kanban_column_id === 'col-doing')
      if (doingTickets.length === 0) {
        // Already cleared above, just ensure state is empty
        setAgentRunsByTicketPk({})
        return
      }
      const ticketPks = doingTickets.map((t) => t.pk)
      // Fetch active agent runs (status not 'finished' or 'failed') for these tickets
      const { data, error } = await client
        .from('hal_agent_runs')
        .select('run_id, agent_type, repo_full_name, ticket_pk, ticket_number, display_id, status, created_at, updated_at')
        .eq('repo_full_name', connectedRepoFullName)
        .in('ticket_pk', ticketPks)
        .in('status', ['created', 'launching', 'polling'])
        .order('created_at', { ascending: false })
      if (error) {
        console.warn('Failed to fetch agent runs:', error)
        return
      }
      // Map by ticket_pk, keeping only the most recent active run per ticket
      const runsByTicket: Record<string, SupabaseAgentRunRow> = {}
      for (const run of (data ?? []) as SupabaseAgentRunRow[]) {
        if (run.ticket_pk && (!runsByTicket[run.ticket_pk] || new Date(run.created_at) > new Date(runsByTicket[run.ticket_pk].created_at))) {
          runsByTicket[run.ticket_pk] = run
        }
      }
      // CRITICAL FIX (0135): Final check using current state to ensure we only include tickets currently in Doing
      // This handles race conditions where tickets might have moved during the async fetch
      // Read the absolute latest tickets from ref (updated synchronously in refetchSupabaseTickets)
      const latestTickets = supabaseTicketsRef.current
      const currentDoingTickets = latestTickets.filter((t) => t.kanban_column_id === 'col-doing')
      const currentTicketPkSet = new Set(currentDoingTickets.map((t) => t.pk))
      const finalRuns: Record<string, SupabaseAgentRunRow> = {}
      for (const ticketPk of Object.keys(runsByTicket)) {
        if (currentTicketPkSet.has(ticketPk)) {
          finalRuns[ticketPk] = runsByTicket[ticketPk]
        }
      }
      setAgentRunsByTicketPk(finalRuns)
    } catch (e) {
      console.warn('Failed to fetch agent runs:', e)
    }
  }, [supabaseProjectUrl, supabaseAnonKey, connectedRepoFullName])

  // Resolve ticket detail modal content when modal opens (0033); Supabase-only (0065)
  useEffect(() => {
    if (!detailModal) {
      setDetailModalBody(null)
      setDetailModalError(null)
      setDetailModalLoading(false)
      setDetailModalArtifacts([])
      setDetailModalArtifactsLoading(false)
      setDetailModalArtifactsStatus(null)
      setDetailModalAttachments([])
      setDetailModalAttachmentsLoading(false)
      setDetailModalFailureCounts(null)
      return
    }
    const { ticketId } = detailModal
    // Library mode: body from HAL-passed data; artifacts via HAL callback (HAL owns DB)
    if (halCtx) {
      const row = sourceTickets.find((t) => t.pk === ticketId)
      if (row) {
        setDetailModalBody(row.body_md ?? '')
      } else {
        setDetailModalBody('')
      }
      setDetailModalLoading(false)
      setDetailModalError(null)
      setDetailModalArtifactsLoading(true)
      setDetailModalArtifactsStatus('Loading…')
      const tryApiFallback = (): Promise<SupabaseAgentArtifactRow[]> => {
        const url = halCtx.supabaseUrl?.trim()
        const key = halCtx.supabaseAnonKey?.trim()
        const body: { ticketPk: string; supabaseUrl?: string; supabaseAnonKey?: string } = { ticketPk: ticketId }
        if (url && key) {
          body.supabaseUrl = url
          body.supabaseAnonKey = key
        }
        return fetchWithRetry(
          () => fetch('/api/artifacts/get', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body),
          }),
          3, // maxRetries
          1000 // initialDelayMs
        )
          .then((r) => r.json().catch(() => ({})))
          .then((j: { artifacts?: SupabaseAgentArtifactRow[]; error?: string }) => {
            if (j.error && !Array.isArray(j.artifacts)) {
              console.warn('Artifacts API returned error:', j.error)
              return []
            }
            return Array.isArray(j.artifacts) ? j.artifacts : []
          })
      }
      if (halCtx.fetchArtifactsForTicket) {
        halCtx
          .fetchArtifactsForTicket(ticketId)
          .then((data) => {
            const list = data ?? []
            if (list.length > 0) {
              setDetailModalArtifacts(list)
              setDetailModalArtifactsStatus(`Loaded ${list.length} (callback)`)
              return
            }
            return tryApiFallback().then((apiList) => {
              setDetailModalArtifacts(apiList)
              setDetailModalArtifactsStatus(apiList.length > 0 ? `Loaded ${apiList.length} (API fallback)` : 'No artifacts (callback empty, API empty)')
            })
          })
          .catch((e) => {
            const msg = e instanceof Error ? e.message : String(e)
            console.warn('Failed to fetch artifacts (library mode):', e)
            setDetailModalArtifactsStatus(`Error: ${msg}`)
            return tryApiFallback().then((apiList) => {
              setDetailModalArtifacts(apiList)
              if (apiList.length > 0) setDetailModalArtifactsStatus(`Loaded ${apiList.length} (API fallback after error)`)
            })
          })
          .finally(() => setDetailModalArtifactsLoading(false))
      } else {
        tryApiFallback()
          .then((apiList) => {
            setDetailModalArtifacts(apiList)
            setDetailModalArtifactsStatus(apiList.length > 0 ? `Loaded ${apiList.length} (API)` : 'No artifacts')
          })
          .catch(() => {
            setDetailModalArtifacts([])
            setDetailModalArtifactsStatus('Error: API request failed')
          })
          .finally(() => setDetailModalArtifactsLoading(false))
      }
      
      // Fetch failure counts in library mode (0195)
      const url = halCtx.supabaseUrl?.trim()
      const key = halCtx.supabaseAnonKey?.trim()
      if (url && key) {
        fetch('/api/tickets/check-failure-escalation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketPk: ticketId,
            supabaseUrl: url,
            supabaseAnonKey: key,
          }),
        })
          .then((r) => r.json())
          .then((result: { success?: boolean; qa_fail_count?: number; hitl_fail_count?: number }) => {
            if (result.success) {
              setDetailModalFailureCounts({
                qa: result.qa_fail_count ?? 0,
                hitl: result.hitl_fail_count ?? 0,
              })
            }
          })
          .catch(() => {
            // Silently fail - failure counts are optional
            setDetailModalFailureCounts(null)
          })
      }
      return
    }
    if (supabaseBoardActive) {
      const row = supabaseTickets.find((t) => t.pk === ticketId)
      if (row) {
        // Normalize Title line if needed (0054)
        const displayId = row.display_id ?? row.id
        const { normalized, wasNormalized } = normalizeTitleLineInBody(row.body_md, displayId)
        if (wasNormalized) {
          // Update in Supabase and show diagnostic
          const url = supabaseProjectUrl.trim()
          const key = supabaseAnonKey.trim()
          if (url && key) {
            const client = createClient(url, key)
            ;(async () => {
              try {
                const { error } = await client.from('tickets').update({ body_md: normalized }).eq('pk', row.pk)
                if (error) throw error
                addLog(`Ticket ${displayId}: Title normalized to include ID prefix`)
                // Update local state
                setSupabaseTickets((prev) =>
                  prev.map((t) => (t.pk === row.pk ? { ...t, body_md: normalized } : t))
                )
              } catch (err) {
                console.warn(`Failed to normalize ticket ${displayId}:`, err)
              }
            })()
          }
        }
        setDetailModalBody(normalized)
        
        // Fetch artifacts (0082)
        setDetailModalArtifactsLoading(true)
        setDetailModalArtifactsStatus('Loading…')
        fetchTicketArtifacts(ticketId).then((artifacts) => {
          setDetailModalArtifacts(artifacts)
          setDetailModalArtifactsStatus(artifacts.length > 0 ? `Loaded ${artifacts.length}` : 'No artifacts')
          setDetailModalArtifactsLoading(false)
        }).catch((e) => {
          setDetailModalArtifacts([])
          setDetailModalArtifactsStatus(`Error: ${e instanceof Error ? e.message : String(e)}`)
          setDetailModalArtifactsLoading(false)
        })
        
        // Fetch attachments (0092)
        setDetailModalAttachmentsLoading(true)
        fetchTicketAttachments(row.id).then((attachments) => {
          setDetailModalAttachments(attachments)
          setDetailModalAttachmentsLoading(false)
        }).catch(() => {
          setDetailModalAttachments([])
          setDetailModalAttachmentsLoading(false)
        })
        
        // Fetch failure counts (0195)
        const url = supabaseProjectUrl.trim()
        const key = supabaseAnonKey.trim()
        if (url && key) {
          fetch('/api/tickets/check-failure-escalation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ticketPk: ticketId,
              supabaseUrl: url,
              supabaseAnonKey: key,
            }),
          })
            .then((r) => r.json())
            .then((result: { success?: boolean; qa_fail_count?: number; hitl_fail_count?: number }) => {
              if (result.success) {
                setDetailModalFailureCounts({
                  qa: result.qa_fail_count ?? 0,
                  hitl: result.hitl_fail_count ?? 0,
                })
              }
            })
            .catch(() => {
              // Silently fail - failure counts are optional
              setDetailModalFailureCounts(null)
            })
        }
      } else {
        setDetailModalBody('')
        setDetailModalArtifacts([])
        setDetailModalArtifactsLoading(false)
        setDetailModalArtifactsStatus(null)
      setDetailModalAttachments([])
      setDetailModalAttachmentsLoading(false)
      setDetailModalFailureCounts(null)
    }
    setDetailModalError(null)
    setDetailModalLoading(false)
    } else {
      // Supabase not connected: show error
      setDetailModalError('Supabase not connected. Connect project folder to view ticket details.')
      setDetailModalBody(null)
      setDetailModalLoading(false)
      setDetailModalArtifacts([])
      setDetailModalArtifactsLoading(false)
      setDetailModalArtifactsStatus(null)
      setDetailModalAttachments([])
      setDetailModalAttachmentsLoading(false)
    }
  }, [detailModal, halCtx, sourceTickets, supabaseBoardActive, supabaseTickets, supabaseProjectUrl, supabaseAnonKey, detailModalRetryTrigger, addLog, fetchTicketArtifacts, fetchTicketAttachments])

  /** Re-run artifact fetch for the currently open ticket (library or Supabase mode). */
  const refreshDetailModalArtifacts = useCallback(() => {
    if (!detailModal) return
    const { ticketId } = detailModal
    if (halCtx) {
      setDetailModalArtifactsLoading(true)
      setDetailModalArtifactsStatus('Refreshing…')
      const tryApiFallback = (): Promise<SupabaseAgentArtifactRow[]> => {
        const url = halCtx.supabaseUrl?.trim()
        const key = halCtx.supabaseAnonKey?.trim()
        const body: { ticketPk: string; supabaseUrl?: string; supabaseAnonKey?: string } = { ticketPk: ticketId }
        if (url && key) {
          body.supabaseUrl = url
          body.supabaseAnonKey = key
        }
        return fetchWithRetry(
          () => fetch('/api/artifacts/get', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body),
          }),
          3, // maxRetries
          1000 // initialDelayMs
        )
          .then((r) => r.json().catch(() => ({})))
          .then((j: { artifacts?: SupabaseAgentArtifactRow[]; error?: string }) => {
            if (j.error && !Array.isArray(j.artifacts)) {
              console.warn('Artifacts API returned error:', j.error)
              return []
            }
            return Array.isArray(j.artifacts) ? j.artifacts : []
          })
      }
      if (halCtx.fetchArtifactsForTicket) {
        halCtx
          .fetchArtifactsForTicket(ticketId)
          .then((data) => {
            const list = data ?? []
            if (list.length > 0) {
              setDetailModalArtifacts(list)
              setDetailModalArtifactsStatus(`Loaded ${list.length} (callback)`)
              return
            }
            return tryApiFallback().then((apiList) => {
              setDetailModalArtifacts(apiList)
              setDetailModalArtifactsStatus(apiList.length > 0 ? `Loaded ${apiList.length} (API fallback)` : 'No artifacts (callback empty, API empty)')
            })
          })
          .catch((e) => {
            const msg = e instanceof Error ? e.message : String(e)
            setDetailModalArtifactsStatus(`Error: ${msg}`)
            return tryApiFallback().then((apiList) => {
              setDetailModalArtifacts(apiList)
              if (apiList.length > 0) setDetailModalArtifactsStatus(`Loaded ${apiList.length} (API fallback after error)`)
            })
          })
          .finally(() => setDetailModalArtifactsLoading(false))
      } else {
        tryApiFallback()
          .then((apiList) => {
            setDetailModalArtifacts(apiList)
            setDetailModalArtifactsStatus(apiList.length > 0 ? `Loaded ${apiList.length} (API)` : 'No artifacts')
          })
          .catch(() => {
            setDetailModalArtifacts([])
            setDetailModalArtifactsStatus('Error: API request failed')
          })
          .finally(() => setDetailModalArtifactsLoading(false))
      }
    } else if (supabaseBoardActive) {
      setDetailModalArtifactsLoading(true)
      setDetailModalArtifactsStatus('Refreshing…')
      fetchTicketArtifacts(ticketId).then((artifacts) => {
        setDetailModalArtifacts(artifacts)
        setDetailModalArtifactsStatus(artifacts.length > 0 ? `Loaded ${artifacts.length}` : 'No artifacts')
        setDetailModalArtifactsLoading(false)
      }).catch((e) => {
        setDetailModalArtifacts([])
        setDetailModalArtifactsStatus(`Error: ${e instanceof Error ? e.message : String(e)}`)
        setDetailModalArtifactsLoading(false)
      })
    }
  }, [detailModal, halCtx, supabaseBoardActive, fetchTicketArtifacts])

  const handleOpenTicketDetail = useCallback(
    (cardId: string) => {
      const card = cardsForDisplay[cardId]
      if (card) {
        const ticket = sourceTickets.find((t) => t.pk === cardId)
        const columnId = ticket?.kanban_column_id ?? null
        setDetailModal({ ticketId: cardId, title: card.title, columnId })
      }
    },
    [cardsForDisplay, sourceTickets]
  )
  const handleCloseTicketDetail = useCallback(() => {
    setDetailModal(null)
    setArtifactViewer(null)
    setArtifactViewerIndex(0)
  }, [])
  const handleRetryTicketDetail = useCallback(() => setDetailModalRetryTrigger((n) => n + 1), [])
  const handleOpenArtifact = useCallback((artifact: SupabaseAgentArtifactRow) => {
    // Ensure artifact is valid and has required properties
    if (!artifact) {
      console.error('handleOpenArtifact: artifact is null or undefined')
      return
    }
    
    if (!artifact.artifact_id) {
      console.error('handleOpenArtifact: artifact missing artifact_id', artifact)
      return
    }
    
    // Validate artifact has required fields with fallbacks
    const validatedArtifact: SupabaseAgentArtifactRow = {
      artifact_id: artifact.artifact_id,
      ticket_pk: artifact.ticket_pk || '',
      repo_full_name: artifact.repo_full_name || '',
      agent_type: artifact.agent_type || 'other',
      title: artifact.title || 'Untitled Artifact',
      body_md: artifact.body_md || '',
      created_at: artifact.created_at || new Date().toISOString(),
      updated_at: artifact.updated_at || new Date().toISOString(),
    }
    
    // Sort artifacts chronologically (oldest first) to find index (0148)
    // Use detailModalArtifacts if available, otherwise artifact might be from props
    const artifactsToSearch = detailModalArtifacts.length > 0 
      ? detailModalArtifacts 
      : [validatedArtifact] // Fallback to the artifact itself if list is empty
    
    const sortedArtifacts = [...artifactsToSearch].sort((a, b) => {
      const timeA = new Date(a.created_at || 0).getTime()
      const timeB = new Date(b.created_at || 0).getTime()
      if (timeA !== timeB) {
        return timeA - timeB
      }
      // Secondary sort by artifact_id for deterministic ordering when timestamps are equal (0147)
      return (a.artifact_id || '').localeCompare(b.artifact_id || '')
    })
    const index = sortedArtifacts.findIndex(a => a.artifact_id === validatedArtifact.artifact_id)
    
    // Always set the validated artifact
    setArtifactViewer(validatedArtifact)
    setArtifactViewerIndex(index >= 0 ? index : 0)
  }, [detailModalArtifacts])
  const handleCloseArtifact = useCallback(() => {
    setArtifactViewer(null)
    setArtifactViewerIndex(0)
  }, [])
  const handleNavigateArtifact = useCallback((index: number) => {
    // Sort artifacts chronologically (oldest first) to get artifact at index (0148)
    if (detailModalArtifacts.length === 0) {
      console.warn('Cannot navigate: detailModalArtifacts is empty')
      return
    }
    
    const sortedArtifacts = [...detailModalArtifacts].sort((a, b) => {
      const timeA = new Date(a.created_at || 0).getTime()
      const timeB = new Date(b.created_at || 0).getTime()
      if (timeA !== timeB) {
        return timeA - timeB
      }
      // Secondary sort by artifact_id for deterministic ordering when timestamps are equal (0147)
      return (a.artifact_id || '').localeCompare(b.artifact_id || '')
    })
    if (index >= 0 && index < sortedArtifacts.length) {
      const targetArtifact = sortedArtifacts[index]
      if (targetArtifact && targetArtifact.artifact_id) {
        setArtifactViewer(targetArtifact)
        setArtifactViewerIndex(index)
      } else {
        console.error('Invalid artifact at index', index, targetArtifact)
      }
    }
  }, [detailModalArtifacts])
  

  // File system mode removed (0065): Supabase-only

  const _handleSupabaseConnect = useCallback(() => {
    connectSupabase(supabaseProjectUrl.trim(), supabaseAnonKey.trim())
  }, [supabaseProjectUrl, supabaseAnonKey, connectSupabase])

  const _handleSelectSupabaseTicket = useCallback((row: SupabaseTicketRow) => {
    setSelectedSupabaseTicketId(row.pk)
    setSelectedSupabaseTicketContent(row.body_md ?? '')
  }, [])

  /** Refetch tickets and columns from Supabase (0020). Uses current url/key. */
  const refetchSupabaseTickets = useCallback(async (skipPendingMoves = false): Promise<{ success: boolean; freshTickets?: SupabaseTicketRow[] }> => {
    const url = supabaseProjectUrl.trim()
    const key = supabaseAnonKey.trim()
    if (!url || !key) return { success: false }
    try {
      const client = createClient(url, key)
      let rows: unknown[] | null = null
      let error: { code?: string; message?: string } | null = null
      if (connectedRepoFullName) {
        const r = await client
          .from('tickets')
          .select('pk, id, repo_full_name, ticket_number, display_id, filename, title, body_md, kanban_column_id, kanban_position, kanban_moved_at, updated_at')
          .eq('repo_full_name', connectedRepoFullName)
          .order('ticket_number', { ascending: true })
        rows = (r.data ?? null) as unknown[] | null
        error = (r.error as typeof error) ?? null
      } else {
        // No repo connected: show no tickets (repo-scoped 0079)
        rows = []
        error = null
      }
      if (error) {
        const eAny = error as any
        setSupabaseLastError((eAny?.message as string | undefined) ?? String(error))
        return { success: false }
      }
      
      // Normalize Title lines and update DB if needed (0054)
      const normalizedRows: SupabaseTicketRow[] = []
      const normalizationPromises: Promise<void>[] = []
      for (const rawRow of (rows ?? []) as any[]) {
        const row = normalizeTicketRow(rawRow)
        const displayId = row.display_id ?? row.id
        const { normalized, wasNormalized } = normalizeTitleLineInBody(row.body_md, displayId)
        if (wasNormalized) {
          // Update ticket in Supabase with normalized body_md
          const updatePromise = (async () => {
            try {
              const { error } = await client.from('tickets').update({ body_md: normalized }).eq('pk', row.pk)
              if (error) throw error
              addLog(`Ticket ${displayId}: Title normalized to include ID prefix`)
            } catch (err) {
              console.warn(`Failed to normalize ticket ${displayId}:`, err)
            }
          })()
          normalizationPromises.push(updatePromise)
          normalizedRows.push({ ...row, body_md: normalized })
        } else {
          normalizedRows.push(row)
        }
      }
      
      // Compute final tickets array (0135) - this is what will be set in state
      let finalTickets: SupabaseTicketRow[] = []
      
      // Don't overwrite tickets that have pending moves (0047)
      // Improved: Preserve optimistic positions to prevent snap-back and jumps (0144)
      // CRITICAL: Always preserve optimistic positions for tickets in pendingMoves,
      // but check if backend has confirmed during polling refetches and remove from pendingMoves if confirmed
      if (skipPendingMoves && pendingMoves.size > 0) {
        setSupabaseTickets((prev) => {
          const newMap = new Map(normalizedRows.map((r) => [r.pk, r]))
          // Preserve optimistic updates for pending moves, but check if backend confirmed
          const result: SupabaseTicketRow[] = []
          const processedIds = new Set<string>()
          const confirmedMoves = new Set<string>()
          // First, add all existing tickets (preserving pending moves, but checking for backend confirmation)
          for (const t of prev) {
            if (pendingMoves.has(t.pk)) {
              const dbRow = newMap.get(t.pk)
              // Check if backend position matches optimistic position (backend confirmed)
              if (dbRow && 
                  dbRow.kanban_column_id === t.kanban_column_id && 
                  dbRow.kanban_position === t.kanban_position) {
                // Backend confirmed - update with DB data and mark for removal from pendingMoves
                result.push(dbRow)
                confirmedMoves.add(t.pk)
              } else {
                // Backend hasn't confirmed yet - keep optimistic update
                result.push(t)
              }
              processedIds.add(t.pk)
            } else if (newMap.has(t.pk)) {
              result.push(newMap.get(t.pk)!) // Update from DB
              processedIds.add(t.pk)
            }
          }
          // Then, add any new tickets from DB that weren't in prev
          for (const row of normalizedRows) {
            if (!processedIds.has(row.pk)) {
              result.push(row)
            }
          }
          // Remove confirmed moves from pendingMoves
          if (confirmedMoves.size > 0) {
            setPendingMoves((prevPending) => {
              const next = new Set(prevPending)
              for (const pk of confirmedMoves) {
                next.delete(pk)
              }
              return next
            })
          }
          finalTickets = result
          return result
        })
      } else {
        // When not skipping pending moves (refetch after move completes), preserve optimistic positions
        // until backend confirms the move to prevent jumps when backend data arrives (0144)
        // CRITICAL FIX: Never update tickets in pendingMoves from DB unless backend EXACTLY matches optimistic position
        setSupabaseTickets((prev) => {
          const newMap = new Map(normalizedRows.map((r) => [r.pk, r]))
          const result: SupabaseTicketRow[] = []
          const processedIds = new Set<string>()
          // For tickets with pending moves, ALWAYS keep optimistic position until backend matches
          // This prevents snap-back when refetch happens before backend save completes
          for (const t of prev) {
            if (pendingMoves.has(t.pk)) {
              // CRITICAL: For tickets in pendingMoves, NEVER update from DB unless backend position
              // EXACTLY matches the optimistic position. This prevents snap-back.
              const dbRow = newMap.get(t.pk)
              if (dbRow && 
                  dbRow.kanban_column_id === t.kanban_column_id && 
                  dbRow.kanban_position === t.kanban_position) {
                // Backend matches optimistic update - safe to update with DB data
                // Note: Ticket remains in pendingMoves until handler confirms and removes it
                result.push(dbRow)
              } else {
                // Backend hasn't caught up yet OR there's a discrepancy - ALWAYS KEEP optimistic update
                // This is the key fix: never overwrite optimistic position with stale DB data
                result.push(t)
              }
              processedIds.add(t.pk)
            } else if (newMap.has(t.pk)) {
              const dbRow = newMap.get(t.pk)!
              const existingTicket = prev.find((p) => p.pk === dbRow.pk)
              // Only update if position/column actually changed to prevent unnecessary re-renders (0144)
              if (existingTicket && 
                  existingTicket.kanban_column_id === dbRow.kanban_column_id && 
                  existingTicket.kanban_position === dbRow.kanban_position) {
                // Position hasn't changed - keep existing ticket to prevent jump
                result.push(existingTicket)
              } else {
                // Position changed or new ticket - update from DB
                result.push(dbRow)
              }
              processedIds.add(t.pk)
            }
          }
          // Add any new tickets from DB that weren't in prev
          for (const row of normalizedRows) {
            if (!processedIds.has(row.pk)) {
              result.push(row)
            }
          }
          finalTickets = result
          return result
        })
      }
      
      // Wait for normalization updates to complete (fire and forget)
      Promise.all(normalizationPromises).catch(() => {
        // Errors already logged above
      })
      setSupabaseLastRefresh(new Date())

      const { data: colRows, error: colError } = await client
        .from('kanban_columns')
        .select('id, title, position, created_at, updated_at')
        .order('position', { ascending: true })
      if (colError) {
        setSupabaseColumnsLastError(colError.message ?? String(colError))
      } else {
        setSupabaseColumnsRows(canonicalizeColumnRows((colRows ?? []) as SupabaseKanbanColumnRow[]))
        setSupabaseColumnsLastRefresh(new Date())
        setSupabaseColumnsLastError(null)
      }
      
      // CRITICAL FIX (0135): Update ref synchronously with final tickets
      // This ensures fetchActiveAgentRuns always has the latest tickets including optimistic updates
      supabaseTicketsRef.current = finalTickets
      
      return { success: true, freshTickets: finalTickets }
    } catch {
      return { success: false }
    }
  }, [supabaseProjectUrl, supabaseAnonKey, pendingMoves, connectedRepoFullName])

  /** Update one ticket's kanban fields in Supabase (0013). Returns { ok: true } or { ok: false, error: string }. */
  const updateSupabaseTicketKanban = useCallback(
    async (
      pk: string,
      updates: { kanban_column_id?: string; kanban_position?: number; kanban_moved_at?: string }
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const url = supabaseProjectUrl.trim()
      const key = supabaseAnonKey.trim()
      if (!url || !key) {
        const err = 'Supabase not configured (URL/key missing). Connect first.'
        setSupabaseLastError(err)
        return { ok: false, error: err }
      }
      try {
        const client = createClient(url, key)
        const { error } = await client.from('tickets').update(updates).eq('pk', pk)
        if (error) {
          const msg = error.message ?? String(error)
          setSupabaseLastError(msg)
          return { ok: false, error: msg }
        }
        return { ok: true }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setSupabaseLastError(msg)
        return { ok: false, error: msg }
      }
    },
    [supabaseProjectUrl, supabaseAnonKey]
  )

  // Listen for postMessage from HAL parent (when embedded in iframe). Skip when library mode (halCtx).
  useEffect(() => {
    if (halCtx || !isEmbedded) return

    const handleMessage = async (event: MessageEvent) => {
      // Only accept messages from parent origin
      if (event.source !== window.parent) return

      const data = event.data as { type?: string; url?: string; key?: string; theme?: string; repoFullName?: string; ticketId?: string; ticketPk?: string }

      if (data.type === 'HAL_CONNECT_SUPABASE' && data.url && data.key) {
        setProjectName('HAL-connected')
        setSupabaseProjectUrl(data.url)
        setSupabaseAnonKey(data.key)
        connectSupabase(data.url, data.key)
      } else if (data.type === 'HAL_CONNECT_REPO' && data.repoFullName) {
        setConnectedRepoFullName(data.repoFullName)
        setProjectName(data.repoFullName)
        try {
          localStorage.setItem(CONNECTED_REPO_KEY, data.repoFullName)
        } catch {
          // ignore
        }
      } else if (data.type === 'HAL_DISCONNECT') {
        setProjectName(null)
        setConnectedRepoFullName(null)
        try {
          localStorage.removeItem(CONNECTED_REPO_KEY)
        } catch {
          // ignore
        }
        setSupabaseConnectionStatus('disconnected')
        setSupabaseTickets([])
        setSupabaseColumnsRows([])
      } else if (data.type === 'HAL_THEME_CHANGE' && data.theme) {
        // Apply theme to document root (0078)
        document.documentElement.setAttribute('data-theme', data.theme)
      } else if (data.type === 'HAL_TICKET_CREATED' && supabaseBoardActive && refetchSupabaseTickets) {
        // Immediately refresh tickets when a new ticket is created (0133)
        try {
          const result = await refetchSupabaseTickets(false)
          const success = result.success
          if (!success) {
            // Non-blocking error: show message but continue normal polling
            console.warn('[Kanban] Failed to refresh tickets after creation, will retry on next poll')
          }
        } catch (err) {
          console.warn('[Kanban] Error refreshing tickets after creation:', err)
          // Continue normal polling; error is non-blocking
        }
      } else if (data.type === 'HAL_TICKET_IMPLEMENTATION_COMPLETE' && supabaseBoardActive && updateSupabaseTicketKanban && refetchSupabaseTickets) {
        // Move ticket from Doing to QA when Implementation agent completes work (0084)
        const ticketIdOrPk = data.ticketPk || data.ticketId
        if (ticketIdOrPk) {
          // Find ticket by PK (UUID) or by display_id (e.g. HAL-0084 or 0084)
          let ticket = supabaseTickets.find((t) => t.pk === ticketIdOrPk)
          if (!ticket) {
            // Try to find by display_id
            const normalizedId = ticketIdOrPk.replace(/^HAL-?/i, '').padStart(4, '0')
            ticket = supabaseTickets.find((t) => {
              const displayId = t.display_id ?? t.id
              const normalizedDisplayId = displayId.replace(/^HAL-?/i, '').padStart(4, '0')
              return normalizedDisplayId === normalizedId
            })
          }
          // Only move if ticket is currently in Doing
          if (ticket && ticket.kanban_column_id === 'col-doing') {
            const targetColumn = supabaseColumns.find((c) => c.id === 'col-qa')
            if (targetColumn) {
              const targetPosition = targetColumn.cardIds.length
              const movedAt = new Date().toISOString()
              const result = await updateSupabaseTicketKanban(ticket.pk, {
                kanban_column_id: 'col-qa',
                kanban_position: targetPosition,
                kanban_moved_at: movedAt,
              })
              if (result.ok) {
                // Refetch after a short delay to ensure DB write is visible
                setTimeout(() => {
                  refetchSupabaseTickets(false).then((result) => {
                    // Refetch agent runs since ticket moved from Doing to QA (0135)
                    // Pass fresh tickets directly from refetch result to avoid stale state reads
                    if (result.freshTickets) {
                      fetchActiveAgentRuns(result.freshTickets)
                    } else {
                      // Fallback: ref should be updated by now, but use it as backup
                      fetchActiveAgentRuns()
                    }
                  })
                }, 500)
              }
            }
          }
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [halCtx, isEmbedded, connectSupabase, supabaseBoardActive, supabaseTickets, supabaseColumns, updateSupabaseTicketKanban, refetchSupabaseTickets])

  // When connected repo changes or we connect to Supabase with a repo already set, refetch tickets (0079). Skip when library mode (HAL owns data).
  useEffect(() => {
    if (halCtx || !supabaseBoardActive || !supabaseProjectUrl?.trim() || !supabaseAnonKey?.trim()) return
    refetchSupabaseTickets(false).then((result) => {
      // Fetch agent runs with fresh tickets to ensure accurate badges (0135)
      if (result.freshTickets && fetchActiveAgentRuns) {
        fetchActiveAgentRuns(result.freshTickets)
      } else if (fetchActiveAgentRuns) {
        fetchActiveAgentRuns()
      }
    })
  }, [halCtx, connectedRepoFullName, supabaseBoardActive, refetchSupabaseTickets, fetchActiveAgentRuns])

  // Keep ref in sync with supabaseTickets state (0135) - ensures fetchActiveAgentRuns always reads latest tickets
  useEffect(() => {
    supabaseTicketsRef.current = supabaseTickets
  }, [supabaseTickets])

  // Polling when Supabase board is active (0013). Skip when library mode (HAL passes data).
  useEffect(() => {
    if (halCtx || !supabaseBoardActive) return
    const id = setInterval(() => {
      refetchSupabaseTickets(true).then((result) => {
        // Pass fresh tickets to fetchActiveAgentRuns to ensure accurate badges (0135)
        if (result.freshTickets) {
          fetchActiveAgentRuns(result.freshTickets)
        } else {
          fetchActiveAgentRuns()
        }
      })
    }, SUPABASE_POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [halCtx, supabaseBoardActive, refetchSupabaseTickets, fetchActiveAgentRuns])

  // Fetch agent runs when board becomes active (0114). Skip when library mode (HAL passes agentRunsByTicketPk).
  // NOTE: We don't depend on supabaseTickets here to avoid stale data issues (0135).
  // Instead, fetchActiveAgentRuns is called explicitly after refetches with fresh tickets.
  useEffect(() => {
    if (halCtx || !supabaseBoardActive || !connectedRepoFullName) return
    // Only fetch on initial mount or when repo/board becomes active, not on every ticket change
    fetchActiveAgentRuns()
  }, [halCtx, supabaseBoardActive, connectedRepoFullName, fetchActiveAgentRuns])

  // Log "Initialized default columns" when we seed kanban_columns (0020)
  useEffect(() => {
    if (!supabaseColumnsJustInitialized) return
    const at = formatTime()
    const id = Date.now()
    setActionLog((prev) => [...prev.slice(-19), { id, message: 'Initialized default columns', at }])
    setSupabaseColumnsJustInitialized(false)
  }, [supabaseColumnsJustInitialized])

  // File system sync removed (0065): Supabase-only

  const toggleDebug = useCallback(() => {
    const next = !debugOpen
    setDebugOpen(next)
    addLog(next ? 'Debug toggled ON' : 'Debug toggled OFF')
  }, [debugOpen, addLog])

  const generateNewHalReport = useCallback(() => {
    const lines = [
      'HAL project bootstrap report (wizard v0)',
      `GeneratedAt: ${new Date().toISOString()}`,
      `ProjectName: ${newHalProjectName || '(not set)'}`,
      `RepoUrl: ${newHalRepoUrl || '(not set)'}`,
      'Checklist:',
      `- createdRepo: ${newHalChecklist.createdRepo}`,
      `- copiedScaffold: ${newHalChecklist.copiedScaffold}`,
      `- setEnv: ${newHalChecklist.setEnv}`,
      `- addedToHalSuperProject: ${newHalChecklist.addedToHalSuperProject}`,
    ]
    setNewHalReport(lines.join('\n'))
  }, [newHalChecklist, newHalProjectName, newHalRepoUrl])

  const pickWizardFolder = useCallback(async (mode: 'read' | 'readwrite') => {
    if (typeof window.showDirectoryPicker !== 'function') {
      throw new Error('Folder picker not supported in this browser.')
    }
    return await window.showDirectoryPicker({ mode })
  }, [])

  const copyTextFile = useCallback(
    async (srcDir: FileSystemDirectoryHandle, destDir: FileSystemDirectoryHandle, relPath: string) => {
      const parts = relPath.split('/').filter(Boolean)
      const fileName = parts.pop()
      if (!fileName) throw new Error(`Invalid path: ${relPath}`)

      let curSrc: FileSystemDirectoryHandle = srcDir
      let curDest: FileSystemDirectoryHandle = destDir
      for (const p of parts) {
        curSrc = await curSrc.getDirectoryHandle(p)
        curDest = await curDest.getDirectoryHandle(p, { create: true })
      }

      const srcFileHandle = await curSrc.getFileHandle(fileName)
      const srcFile = await srcFileHandle.getFile()
      const text = await srcFile.text()

      const destFileHandle = await curDest.getFileHandle(fileName, { create: true })
      const writable = await destFileHandle.createWritable()
      await writable.write(text)
      await writable.close()
    },
    []
  )

  const runWizardBootstrap = useCallback(async () => {
    if (!newHalTemplateRoot || !newHalTargetRoot) {
      setNewHalBootstrapError('Select both a scaffold folder and a destination folder first.')
      return
    }
    setNewHalBootstrapError(null)
    setNewHalBootstrapLog(null)

    const filesToCopy = [
      '.gitignore',
      '.env.example',
      'package.json',
      'scripts/sync-tickets.js',
      'docs/tickets/README.md',
      'docs/audit/README.md',
      '.cursor/rules/auditability-and-traceability.mdc',
      '.cursor/rules/bugfix-tracking.mdc',
      '.cursor/rules/build-config-hygiene.mdc',
      '.cursor/rules/conversation-protocol.mdc',
      '.cursor/rules/done-means-pushed.mdc',
      '.cursor/rules/scope-discipline.mdc',
      '.cursor/rules/task-sizing-and-in-app-debugging.mdc',
      '.cursor/rules/ticket-writing-sync-tickets.mdc',
    ]

    const written: string[] = []
    for (const rel of filesToCopy) {
      await copyTextFile(newHalTemplateRoot, newHalTargetRoot, rel)
      written.push(rel)
    }
    setNewHalBootstrapLog(`Wrote ${written.length} file(s):\n` + written.map((p) => `- ${p}`).join('\n'))
    setNewHalChecklist((p) => ({ ...p, copiedScaffold: true }))
  }, [copyTextFile, newHalTargetRoot, newHalTemplateRoot])

  const findColumnByCardId = useCallback(
    (cardId: string) => columnsForDisplay.find((c) => c.cardIds.includes(cardId)),
    [columnsForDisplay]
  )
  const findColumnById = useCallback(
    (id: string) => columnsForDisplay.find((c) => c.id === id),
    [columnsForDisplay]
  )

  const isColumnId = useCallback(
    (id: UniqueIdentifier) => columnsForDisplay.some((c) => c.id === id),
    [columnsForDisplay]
  )

  const collisionDetection = useCallback<CollisionDetection>(
    (args) => {
      const pointerIntersections = pointerWithin(args)
      const intersections =
        pointerIntersections.length > 0 ? pointerIntersections : rectIntersection(args)
      let overId: UniqueIdentifier | null = getFirstCollision(intersections, 'id') ?? null
      if (overId != null) {
        const overColumn = findColumnById(String(overId))
        if (overColumn) {
          const containerItems = overColumn.cardIds
          if (containerItems.length > 0) {
            const closest = closestCenter({
              ...args,
              droppableContainers: args.droppableContainers.filter(
                (c) => c.id !== overId && containerItems.includes(String(c.id))
              ),
            })
            overId = closest[0]?.id ?? overId
          }
        }
        lastOverId.current = overId
        return [{ id: overId }]
      }
      return lastOverId.current ? [{ id: lastOverId.current }] : []
    },
    [findColumnById]
  )

  const handleCreateColumn = useCallback(async () => {
    const title = newColumnTitle.trim()
    if (!title) return
    const normalized = normalizeTitle(title)
    const checkCols = supabaseBoardActive ? supabaseColumns : columns
    const isDuplicate = checkCols.some((c) => normalizeTitle(c.title) === normalized)
    if (isDuplicate) {
      setAddColumnError('Column title must be unique.')
      addLog(`Column add blocked (duplicate): "${normalized}"`)
      return
    }
    setAddColumnError(null)
    if (supabaseBoardActive) {
      const url = supabaseProjectUrl.trim()
      const key = supabaseAnonKey.trim()
      if (!url || !key) {
        setAddColumnError('Supabase not configured.')
        return
      }
      const colId = stableColumnId()
      const maxPos = supabaseColumnsRows.reduce((m, c) => Math.max(m, c.position), -1)
      const position = maxPos + 1
      try {
        const client = createClient(url, key)
        const { error } = await client.from('kanban_columns').insert({ id: colId, title, position })
        if (error) {
          setAddColumnError(error.message ?? String(error))
          setSupabaseColumnsLastError(error.message ?? String(error))
          addLog(`Column add failed: ${error.message ?? String(error)}`)
          return
        }
        await refetchSupabaseTickets()
        setNewColumnTitle('')
        setShowAddColumnForm(false)
        addLog(`Column added: "${title}"`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setAddColumnError(msg)
        addLog(`Column add failed: ${msg}`)
      }
      return
    }
    // Supabase-only mode: can't add columns when not connected
    setAddColumnError('Connect to Supabase to add columns.')
    addLog('Column add blocked: Supabase not connected')
  }, [
    newColumnTitle,
    columns,
    supabaseBoardActive,
    supabaseColumns,
    supabaseColumnsRows,
    supabaseProjectUrl,
    supabaseAnonKey,
    refetchSupabaseTickets,
    addLog,
  ])

  const handleCancelAddColumn = useCallback(() => {
    setNewColumnTitle('')
    setAddColumnError(null)
    setShowAddColumnForm(false)
  }, [])

  const handleRemoveColumn = useCallback(
    (id: string) => {
      if (!supabaseBoardActive) {
        addLog('Column removal blocked: Supabase-only mode requires Supabase connection')
        return
      }
      const col = supabaseColumns.find((c) => c.id === id)
      if (col) addLog(`Column removal: "${col.title}" (Supabase-only: removal via Supabase UI)`)
    },
    [supabaseBoardActive, supabaseColumns, addLog]
  )

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      if (!isColumnId(event.active.id)) setActiveCardId(event.active.id)
    },
    [isColumnId]
  )

  const handleDragOver = useCallback(() => {
    // State is updated only on drop (handleDragEnd) so that cross-column moves
    // see the correct source column and persist.
  }, [])

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveCardId(null)
      const { active, over } = event
      const effectiveOverId = over?.id ?? lastOverId.current
      if (effectiveOverId == null) return

      if (isColumnId(active.id)) {
        // Resolve drop target to column id (over may be a card id when dropping over a column's body)
        const overColumnId = isColumnId(effectiveOverId)
          ? effectiveOverId
          : findColumnByCardId(String(effectiveOverId))?.id
        if (overColumnId == null) {
          addLog('Column reorder skipped: drop target could not be resolved to a column')
          return
        }

        if (supabaseBoardActive) {
          const cols = supabaseColumns
          const oldIndex = cols.findIndex((c) => c.id === active.id)
          const newIndex = cols.findIndex((c) => c.id === overColumnId)
          if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return
          const next = arrayMove(cols, oldIndex, newIndex)
          const url = supabaseProjectUrl.trim()
          const key = supabaseAnonKey.trim()
          if (!url || !key) {
            addLog('Column reorder failed: Supabase not configured')
            return
          }
          try {
            const client = createClient(url, key)
            for (let i = 0; i < next.length; i++) {
              const { error } = await client.from('kanban_columns').update({ position: i }).eq('id', next[i].id)
              if (error) {
                setSupabaseColumnsLastError(error.message ?? String(error))
                addLog(`Column reorder failed: ${error.message ?? String(error)}`)
                await refetchSupabaseTickets()
                return
              }
            }
            await refetchSupabaseTickets()
            addLog(`Columns reordered: ${cols.map((c) => c.title).join(',')} -> ${next.map((c) => c.title).join(',')}`)
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            addLog(`Column reorder failed: ${msg}`)
            await refetchSupabaseTickets()
          }
          return
        }

        // Supabase-only mode: column reorder requires Supabase connection
        addLog('Column reorder blocked: Supabase-only mode requires Supabase connection')
        return
      }

      const sourceColumn = findColumnByCardId(String(active.id))
      const overColumn = findColumnById(String(effectiveOverId)) ?? findColumnByCardId(String(effectiveOverId))

      // Library mode: ticket dropped into column (HAL owns data)
      if (halCtx && !sourceColumn && overColumn && sourceTickets.some((t) => t.pk === String(active.id))) {
        const ticketPk = String(active.id)
        let overIndex = overColumn.cardIds.indexOf(String(effectiveOverId))
        if (overIndex < 0) overIndex = overColumn.cardIds.length
        halCtx.onMoveTicket(ticketPk, overColumn.id, overIndex)
        return
      }

      // File system mode removed (0065): Supabase-only

      // Supabase: drag from ticket list into column (0013)
      if (
        !sourceColumn &&
        supabaseBoardActive &&
        overColumn &&
        supabaseTickets.some((t) => t.pk === String(active.id))
      ) {
        const ticketPk = String(active.id)
        const ticket = supabaseTickets.find((t) => t.pk === ticketPk)
        
        // Validation: prevent QA → Human in the Loop unless merge confirmed (0113)
        if (ticket && ticket.kanban_column_id === 'col-qa' && overColumn.id === 'col-human-in-the-loop') {
          const mergeStatus = checkMergedToMain(ticket.body_md)
          if (!mergeStatus.merged) {
            const featureBranch = extractFeatureBranch(ticket.body_md)
            const errorMsg = featureBranch
              ? `Cannot move to Human in the Loop: Feature branch "${featureBranch}" has not been merged to main. Please confirm the merge before moving.`
              : 'Cannot move to Human in the Loop: Feature branch merge to main has not been confirmed. Please confirm the merge before moving.'
            setLastMovePersisted({
              success: false,
              timestamp: new Date(),
              ticketId: ticketPk,
              error: errorMsg,
            })
            addLog(`Move blocked: ${errorMsg}`)
            alert(errorMsg)
            return
          }
        }
        
        let overIndex = overColumn.cardIds.indexOf(String(effectiveOverId))
        if (overIndex < 0) overIndex = overColumn.cardIds.length
        const movedAt = new Date().toISOString()
        // Optimistic update (0047)
        setPendingMoves((prev) => new Set(prev).add(ticketPk))
        // Immediately update agent runs state when ticket moves to/from Doing (0135)
        // This prevents stale badges from showing during the async refetch
        const wasInDoing = ticket?.kanban_column_id === 'col-doing'
        const isMovingToDoing = overColumn.id === 'col-doing'
        if (wasInDoing && !isMovingToDoing) {
          // Ticket moving out of Doing - immediately clear its agent run and label
          setAgentRunsByTicketPk((prev) => {
            const next = { ...prev }
            delete next[ticketPk]
            return next
          })
          // Clear agent type label when ticket moves out of Doing (0135)
          setActiveWorkAgentTypes((prev) => {
            const next = { ...prev }
            delete next[ticketPk]
            return next
          })
        } else if (!wasInDoing && isMovingToDoing) {
          // Ticket moving to Doing - set badge based on source column (0135)
          // col-todo or col-unassigned → Implementation, col-qa → QA, others → Unassigned
          const sourceColumnId = ticket?.kanban_column_id || null
          let agentType: 'Implementation' | 'QA' | null = null
          if (sourceColumnId === 'col-todo' || sourceColumnId === 'col-unassigned' || !sourceColumnId) {
            agentType = 'Implementation'
          } else if (sourceColumnId === 'col-qa') {
            agentType = 'QA'
          }
          // Set badge immediately based on source column (0135)
          if (agentType) {
            setActiveWorkAgentTypes((prev) => ({ ...prev, [ticketPk]: agentType! }))
          }
        }
        
        setSupabaseTickets((prev) =>
          prev.map((t) =>
            t.pk === ticketPk
              ? { ...t, kanban_column_id: overColumn.id, kanban_position: overIndex, kanban_moved_at: movedAt }
              : t
          )
        )
        const result = await updateSupabaseTicketKanban(ticketPk, {
          kanban_column_id: overColumn.id,
          kanban_position: overIndex,
          kanban_moved_at: movedAt,
        })
          if (result.ok) {
            setLastMovePersisted({ success: true, timestamp: new Date(), ticketId: ticketPk })
            addLog(`Supabase ticket dropped into ${overColumn.title}`)
            // Store expected optimistic position to verify backend confirmation (0144)
            const expectedColumnId = overColumn.id
            const expectedPosition = overIndex
            // Remove from pending after delay - refetch preserves optimistic position until backend matches (0144)
            // CRITICAL: Only remove from pendingMoves when backend position actually matches optimistic position
            // This prevents snap-back when polling refetch happens before backend confirms
            setTimeout(() => {
              refetchSupabaseTickets(false).then((result) => {
                // After refetch, check if backend position matches optimistic position
                // CRITICAL FIX: Check the actual state after refetch to see if backend confirmed
                // The refetch logic preserves optimistic positions, so if the ticket is still at
                // the optimistic position after refetch, backend hasn't confirmed yet
                setSupabaseTickets((currentTickets) => {
                  const currentTicket = currentTickets.find((t) => t.pk === ticketPk)
                  // If backend position matches optimistic position, backend has confirmed
                  // CRITICAL: Only remove from pendingMoves if position EXACTLY matches
                  if (currentTicket && 
                      currentTicket.kanban_column_id === expectedColumnId && 
                      currentTicket.kanban_position === expectedPosition) {
                    // Backend confirmed - safe to remove from pendingMoves
                    // Remove synchronously to avoid race conditions
                    setPendingMoves((prev) => {
                      if (!prev.has(ticketPk)) return prev // Already removed
                      const next = new Set(prev)
                      next.delete(ticketPk)
                      return next
                    })
                  }
                  // If backend hasn't confirmed yet, keep in pendingMoves (will be checked on next poll)
                  return currentTickets
                })
                // Refetch agent runs if ticket moved to/from Doing column (0135)
                // Pass fresh tickets directly from refetch result to avoid stale state reads
                if (overColumn.id === 'col-doing' || ticket?.kanban_column_id === 'col-doing') {
                  if (result.freshTickets) {
                    fetchActiveAgentRuns(result.freshTickets)
                  } else if (fetchActiveAgentRuns) {
                    fetchActiveAgentRuns()
                  }
                }
              }).catch(() => {
                // On error, still remove from pending to avoid stuck state
                setPendingMoves((prev) => {
                  const next = new Set(prev)
                  next.delete(ticketPk)
                  return next
                })
              })
            }, REFETCH_AFTER_MOVE_MS)
        } else {
          // Revert optimistic update on failure (0047)
          setLastMovePersisted({ success: false, timestamp: new Date(), ticketId: ticketPk, error: result.error })
          setPendingMoves((prev) => {
            const next = new Set(prev)
            next.delete(ticketPk)
            return next
          })
          refetchSupabaseTickets(false).then((result) => {
            // Refetch agent runs if ticket was in Doing column (0135)
            // Pass fresh tickets directly from refetch result to avoid stale state reads
            if (ticket?.kanban_column_id === 'col-doing' || overColumn.id === 'col-doing') {
              if (result.freshTickets) {
                fetchActiveAgentRuns(result.freshTickets)
              } else {
                // Fallback: ref should be updated by now, but use it as backup
                fetchActiveAgentRuns()
              }
            }
          }) // Full refetch to restore correct state
          addLog(`Supabase update failed: ${result.error}`)
        }
        return
      }

      if (!sourceColumn || !overColumn) return

      // Library mode: HAL owns data; notify HAL and return
      const sourceCardIds = sourceColumn.cardIds
      const activeIndex = sourceCardIds.indexOf(String(active.id))
      const isSameColumn = sourceColumn.id === overColumn.id
      let overIndex = overColumn.cardIds.indexOf(String(effectiveOverId))
      if (overIndex < 0) overIndex = overColumn.cardIds.length

      if (halCtx) {
        const ticketPk = String(active.id)
        if (isSameColumn) {
          if (activeIndex === overIndex) return
          const newOrder = arrayMove(sourceCardIds, activeIndex, overIndex)
          halCtx.onReorderColumn?.(sourceColumn.id, newOrder)
        } else {
          // QA → Human in the Loop validation (0113)
          const ticket = sourceTickets.find((t) => t.pk === ticketPk)
          if (ticket && sourceColumn.id === 'col-qa' && overColumn.id === 'col-human-in-the-loop') {
            const mergeStatus = checkMergedToMain(ticket.body_md)
            if (!mergeStatus.merged) {
              const featureBranch = extractFeatureBranch(ticket.body_md)
              const errorMsg = featureBranch
                ? `Cannot move to Human in the Loop: Feature branch "${featureBranch}" has not been merged to main.`
                : 'Cannot move to Human in the Loop: Feature branch merge to main has not been confirmed.'
              addLog(`Move blocked: ${errorMsg}`)
              alert(errorMsg)
              return
            }
          }
          halCtx.onMoveTicket(ticketPk, overColumn.id, overIndex)
        }
        return
      }

      // Supabase: move or reorder within/between columns (0013)
      if (supabaseBoardActive) {
        if (isSameColumn) {
          if (activeIndex === overIndex) return
          const newOrder = arrayMove(sourceCardIds, activeIndex, overIndex)
          const movedAt = new Date().toISOString()
          const ticketPk = String(active.id)
          // Optimistic update (0047)
          setPendingMoves((prev) => new Set(prev).add(ticketPk))
          setSupabaseTickets((prev) =>
            prev.map((t) => {
              const i = newOrder.indexOf(t.pk)
              if (i < 0) return t
              return {
                ...t,
                kanban_position: i,
                ...(t.pk === ticketPk ? { kanban_moved_at: movedAt } : {}),
              }
            })
          )
          let allSucceeded = true
          let firstError: string | undefined
          for (let i = 0; i < newOrder.length; i++) {
            const pk = newOrder[i]
            const result = await updateSupabaseTicketKanban(pk, {
              kanban_position: i,
              ...(pk === ticketPk ? { kanban_moved_at: movedAt } : {}),
            })
            if (!result.ok) {
              allSucceeded = false
              if (!firstError) firstError = result.error
              addLog(`Supabase reorder failed: ${result.error}`)
            }
          }
          if (allSucceeded) {
            setLastMovePersisted({ success: true, timestamp: new Date(), ticketId: ticketPk })
            addLog(`Supabase ticket reordered in ${sourceColumn.title}`)
            // Store expected optimistic position to verify backend confirmation (0144)
            const expectedColumnId = sourceColumn.id
            const expectedPosition = overIndex
            // Remove from pending after delay - refetch preserves optimistic position until backend matches (0144)
            // CRITICAL: Only remove from pendingMoves when backend position actually matches optimistic position
            // This prevents snap-back when polling refetch happens before backend confirms
            setTimeout(() => {
              refetchSupabaseTickets(false).then(() => {
                // After refetch, check if backend position matches optimistic position
                // CRITICAL FIX: Check the actual state after refetch to see if backend confirmed
                // The refetch logic preserves optimistic positions, so if the ticket is still at
                // the optimistic position after refetch, backend hasn't confirmed yet
                setSupabaseTickets((currentTickets) => {
                  const currentTicket = currentTickets.find((t) => t.pk === ticketPk)
                  // If backend position matches optimistic position, backend has confirmed
                  // CRITICAL: Only remove from pendingMoves if position EXACTLY matches
                  if (currentTicket && 
                      currentTicket.kanban_column_id === expectedColumnId && 
                      currentTicket.kanban_position === expectedPosition) {
                    // Backend confirmed - safe to remove from pendingMoves
                    // Remove synchronously to avoid race conditions
                    setPendingMoves((prev) => {
                      if (!prev.has(ticketPk)) return prev // Already removed
                      const next = new Set(prev)
                      next.delete(ticketPk)
                      return next
                    })
                  }
                  // If backend hasn't confirmed yet, keep in pendingMoves (will be checked on next poll)
                  return currentTickets
                })
              }).catch(() => {
                // On error, still remove from pending to avoid stuck state
                setPendingMoves((prev) => {
                  const next = new Set(prev)
                  next.delete(ticketPk)
                  return next
                })
              })
            }, REFETCH_AFTER_MOVE_MS)
          } else {
            // Revert optimistic update on failure (0047)
            setLastMovePersisted({ success: false, timestamp: new Date(), ticketId: ticketPk, error: firstError })
            setPendingMoves((prev) => {
              const next = new Set(prev)
              next.delete(ticketPk)
              return next
            })
            refetchSupabaseTickets(false) // Full refetch to restore correct state
          }
        } else {
          // Validation: prevent QA → Human in the Loop unless merge confirmed (0113)
          if (sourceColumn.id === 'col-qa' && overColumn.id === 'col-human-in-the-loop') {
            const ticket = supabaseTickets.find((t) => t.pk === String(active.id))
            if (ticket) {
              const mergeStatus = checkMergedToMain(ticket.body_md)
              if (!mergeStatus.merged) {
                // Revert optimistic update
                setPendingMoves((prev) => {
                  const next = new Set(prev)
                  next.delete(String(active.id))
                  return next
                })
                setSupabaseTickets((prev) => prev) // No change needed, revert already handled
                // Show error message
                const featureBranch = extractFeatureBranch(ticket.body_md)
                const errorMsg = featureBranch
                  ? `Cannot move to Human in the Loop: Feature branch "${featureBranch}" has not been merged to main. Please confirm the merge before moving.`
                  : 'Cannot move to Human in the Loop: Feature branch merge to main has not been confirmed. Please confirm the merge before moving.'
                setLastMovePersisted({
                  success: false,
                  timestamp: new Date(),
                  ticketId: String(active.id),
                  error: errorMsg,
                })
                addLog(`Move blocked: ${errorMsg}`)
                // Show alert to user
                alert(errorMsg)
                return
              }
            }
          }
          
          const movedAt = new Date().toISOString()
          const ticketPk = String(active.id)
          const sourceTicket = supabaseTickets.find((t) => t.pk === ticketPk)
          
          // Immediately update agent runs state when ticket moves to/from Doing (0135)
          // This prevents stale badges from showing during the async refetch
          const wasInDoing = sourceTicket?.kanban_column_id === 'col-doing'
          const isMovingToDoing = overColumn.id === 'col-doing'
          if (wasInDoing && !isMovingToDoing) {
            // Ticket moving out of Doing - immediately clear its agent run and label
            setAgentRunsByTicketPk((prev) => {
              const next = { ...prev }
              delete next[ticketPk]
              return next
            })
            // Clear agent type label when ticket moves out of Doing (0135)
            setActiveWorkAgentTypes((prev) => {
              const next = { ...prev }
              delete next[ticketPk]
              return next
            })
          } else if (!wasInDoing && isMovingToDoing) {
            // Ticket moving to Doing - set badge based on source column (0135)
            // col-todo or col-unassigned → Implementation, col-qa → QA, others → Unassigned
            const sourceColumnId = sourceTicket?.kanban_column_id || null
            let agentType: 'Implementation' | 'QA' | null = null
            if (sourceColumnId === 'col-todo' || sourceColumnId === 'col-unassigned' || !sourceColumnId) {
              agentType = 'Implementation'
            } else if (sourceColumnId === 'col-qa') {
              agentType = 'QA'
            }
            // Set badge immediately based on source column (0135)
            if (agentType) {
              setActiveWorkAgentTypes((prev) => ({ ...prev, [ticketPk]: agentType! }))
            }
          }
          
          // Optimistic update (0047)
          setPendingMoves((prev) => new Set(prev).add(ticketPk))
          setSupabaseTickets((prev) =>
            prev.map((t) =>
              t.pk === ticketPk
                ? { ...t, kanban_column_id: overColumn.id, kanban_position: overIndex, kanban_moved_at: movedAt }
                : t
            )
          )
          const result = await updateSupabaseTicketKanban(ticketPk, {
            kanban_column_id: overColumn.id,
            kanban_position: overIndex,
            kanban_moved_at: movedAt,
          })
          if (result.ok) {
            setLastMovePersisted({ success: true, timestamp: new Date(), ticketId: ticketPk })
            addLog(`Supabase ticket moved to ${overColumn.title}`)
            // Store expected optimistic position to verify backend confirmation (0144)
            const expectedColumnId = overColumn.id
            const expectedPosition = overIndex
            // Remove from pending after delay - refetch preserves optimistic position until backend matches (0144)
            // CRITICAL: Only remove from pendingMoves when backend position actually matches optimistic position
            // This prevents snap-back when polling refetch happens before backend confirms
            const sourceTicket = supabaseTickets.find((t) => t.pk === ticketPk)
            setTimeout(() => {
              refetchSupabaseTickets(false).then((result) => {
                // After refetch, check if backend position matches optimistic position
                // CRITICAL FIX: Check the actual state after refetch to see if backend confirmed
                // The refetch logic preserves optimistic positions, so if the ticket is still at
                // the optimistic position after refetch, backend hasn't confirmed yet
                setSupabaseTickets((currentTickets) => {
                  const currentTicket = currentTickets.find((t) => t.pk === ticketPk)
                  // If backend position matches optimistic position, backend has confirmed
                  // CRITICAL: Only remove from pendingMoves if position EXACTLY matches
                  if (currentTicket && 
                      currentTicket.kanban_column_id === expectedColumnId && 
                      currentTicket.kanban_position === expectedPosition) {
                    // Backend confirmed - safe to remove from pendingMoves
                    // Remove synchronously to avoid race conditions
                    setPendingMoves((prev) => {
                      if (!prev.has(ticketPk)) return prev // Already removed
                      const next = new Set(prev)
                      next.delete(ticketPk)
                      return next
                    })
                  }
                  // If backend hasn't confirmed yet, keep in pendingMoves (will be checked on next poll)
                  return currentTickets
                })
                // Refetch agent runs if ticket moved to/from Doing column (0135)
                // Pass fresh tickets directly from refetch result to avoid stale state reads
                if (overColumn.id === 'col-doing' || sourceTicket?.kanban_column_id === 'col-doing') {
                  if (result.freshTickets) {
                    fetchActiveAgentRuns(result.freshTickets)
                  } else if (fetchActiveAgentRuns) {
                    fetchActiveAgentRuns()
                  }
                }
              }).catch(() => {
                // On error, still remove from pending to avoid stuck state
                setPendingMoves((prev) => {
                  const next = new Set(prev)
                  next.delete(ticketPk)
                  return next
                })
              })
            }, REFETCH_AFTER_MOVE_MS)
          } else {
            // Revert optimistic update on failure (0047)
            setLastMovePersisted({ success: false, timestamp: new Date(), ticketId: ticketPk, error: result.error })
            setPendingMoves((prev) => {
              const next = new Set(prev)
              next.delete(ticketPk)
              return next
            })
            const sourceTicket = supabaseTickets.find((t) => t.pk === ticketPk)
            refetchSupabaseTickets(false).then((result) => {
              // Refetch agent runs if ticket was in Doing column (0135)
              // Pass fresh tickets directly from refetch result to avoid stale state reads
              if (sourceTicket?.kanban_column_id === 'col-doing' || overColumn.id === 'col-doing') {
                if (result.freshTickets) {
                  fetchActiveAgentRuns(result.freshTickets)
                } else {
                  // Fallback: ref should be updated by now, but use it as backup
                  fetchActiveAgentRuns()
                }
              }
            }) // Full refetch to restore correct state
            addLog(`Supabase ticket move failed: ${result.error}`)
          }
        }
        return
      }

      // File system mode removed (0065): Supabase-only
      // If we reach here without Supabase active, it's an error state
      if (!supabaseBoardActive) {
        addLog('Card move blocked: Supabase-only mode requires Supabase connection')
        return
      }
    },
    [
      halCtx,
      sourceTickets,
      supabaseBoardActive,
      supabaseColumns,
      supabaseProjectUrl,
      supabaseAnonKey,
      supabaseTickets,
      updateSupabaseTicketKanban,
      refetchSupabaseTickets,
      findColumnByCardId,
      findColumnById,
      isColumnId,
      addLog,
    ]
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const columnOrderDisplay =
    columnsForDisplay.length === 0 ? '(none)' : columnsForDisplay.map((c) => c.title).join(' → ')

  const kanbanCardsDisplay =
    columnsForDisplay.length === 0
      ? '(none)'
      : columnsForDisplay
          .map((c) => `${c.title}: ${c.cardIds.map((id) => cardsForDisplay[id]?.title ?? id).join(',')}`)
          .join(' | ')

  /** Per-column ticket IDs for Debug (0013); human-verifiable without external tools */
  const kanbanColumnTicketIdsDisplay =
    columnsForDisplay.length === 0
      ? '(none)'
      : columnsForDisplay.map((c) => `${c.title}: ${c.cardIds.length ? c.cardIds.join(',') : '(empty)'}`).join(' | ')

  // Env-based Supabase config (0014); used for main UI error and Debug panel
  const envUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
  const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()
  const supabaseConfigMissing = !envUrl || !envKey
  const showConfigMissingError = supabaseConfigMissing && supabaseConnectionStatus !== 'connected'

  // Retain for possible Debug-only features; satisfy noUnusedLocals
  const _retain = [
    DEFAULT_COLUMNS,
    INITIAL_CARDS,
    _SUPABASE_SETUP_SQL,
    _SUPABASE_KANBAN_COLUMNS_SETUP_SQL,
    _SUPABASE_TICKET_ATTACHMENTS_SETUP_SQL,
    _DraggableSupabaseTicketItem,
    _supabaseNotInitialized,
    _selectedSupabaseTicketId,
    _selectedSupabaseTicketContent,
    _handleSupabaseConnect,
    _handleSelectSupabaseTicket,
    QAInfoSection,
  ]
  void _retain

  return (
    <>
      {/* Hide title and header when embedded in HAL */}
      {!isEmbedded && (
        <>
          <h1>Portfolio 2026</h1>
          <p className="subtitle">Project Zero: Kanban</p>

          <header className="app-header-bar" aria-label="Project connection">
            {!projectFolderHandle ? (
              <button
                type="button"
                className="connect-project-btn"
                onClick={handleConnectProjectFolder}
              >
                Connect Project Folder
              </button>
            ) : (
              <div className="project-info">
                <span className="project-name">{projectName}</span>
                <button
                  type="button"
                  className="disconnect-btn"
                  onClick={() => {
                    setProjectFolderHandle(null)
                    setProjectName(null)
                    setSupabaseConnectionStatus('disconnected')
                    setSupabaseTickets([])
                    setSupabaseColumnsRows([])
                  }}
                >
                  Disconnect
                </button>
              </div>
            )}
            <button
              type="button"
              className="new-hal-project-btn"
              onClick={() => {
                setNewHalWizardOpen(true)
                setNewHalReport(null)
              }}
            >
              New HAL project
            </button>
            <p className="connection-status" data-status={supabaseConnectionStatus} aria-live="polite">
              {supabaseConnectionStatus === 'connecting'
                ? 'Connecting…'
                : supabaseConnectionStatus === 'connected'
                  ? 'Connected'
                  : 'Disconnected'}
            </p>
          </header>
        </>
      )}

      {connectError && (
        <div className="config-missing-error" role="alert">
          {connectError}
        </div>
      )}


      {/* Ticket persistence status indicator (0047) */}
      {supabaseBoardActive && lastMovePersisted && (
        <div
          className={lastMovePersisted.success ? 'success-message move-status-message' : 'config-missing-error move-status-message move-status-error'}
          role={lastMovePersisted.success ? 'status' : 'alert'}
        >
          {lastMovePersisted.success ? (
            <>✓ Move persisted: ticket {lastMovePersisted.ticketId} at {lastMovePersisted.timestamp.toLocaleTimeString()}</>
          ) : (
            <>
              ✗ Move failed: ticket {lastMovePersisted.ticketId} - {lastMovePersisted.error ?? 'Unknown error'}
              <button
                type="button"
                className="move-status-dismiss"
                onClick={() => setLastMovePersisted(null)}
                aria-label="Dismiss error message"
                title="Dismiss"
              >
                ×
              </button>
            </>
          )}
        </div>
      )}
      {/* Auto-dismiss success messages after 5 seconds (0144: errors stay until dismissed) */}
      {lastMovePersisted?.success && (
        <AutoDismissMessage
          onDismiss={() => setLastMovePersisted(null)}
          delay={5000}
        />
      )}

      {newHalWizardOpen && (
        <div className="modal-backdrop" role="dialog" aria-label="New HAL project wizard">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">New HAL project (wizard v0)</h2>
              <button type="button" className="modal-close" onClick={() => setNewHalWizardOpen(false)}>
                Close
              </button>
            </div>

            <p className="modal-subtitle">
              This is a checklist-only wizard. It helps you set up a new repo without losing the rules/docs/process we learned in Project 0.
            </p>

            <div className="modal-grid">
              <label className="field">
                <span className="field-label">Project name</span>
                <input
                  className="field-input"
                  value={newHalProjectName}
                  onChange={(e) => setNewHalProjectName(e.target.value)}
                  placeholder="portfolio-2026-project-1"
                />
              </label>

              <label className="field">
                <span className="field-label">Repo URL (optional)</span>
                <input
                  className="field-input"
                  value={newHalRepoUrl}
                  onChange={(e) => setNewHalRepoUrl(e.target.value)}
                  placeholder="https://github.com/you/portfolio-2026-project-1"
                />
              </label>
            </div>

            <div className="checklist">
              <label className="check">
                <input
                  type="checkbox"
                  checked={newHalChecklist.createdRepo}
                  onChange={(e) => setNewHalChecklist((p) => ({ ...p, createdRepo: e.target.checked }))}
                />
                <span>Repo created (local + remote)</span>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={newHalChecklist.copiedScaffold}
                  onChange={(e) => setNewHalChecklist((p) => ({ ...p, copiedScaffold: e.target.checked }))}
                />
                <span>Copied scaffold (`.cursor/rules`, `docs/`, `scripts/sync-tickets.js`, `.env.example`)</span>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={newHalChecklist.setEnv}
                  onChange={(e) => setNewHalChecklist((p) => ({ ...p, setEnv: e.target.checked }))}
                />
                <span>Configured `.env` (Supabase keys) and confirmed `.env` is ignored</span>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={newHalChecklist.addedToHalSuperProject}
                  onChange={(e) => setNewHalChecklist((p) => ({ ...p, addedToHalSuperProject: e.target.checked }))}
                />
                <span>Added as submodule in HAL super-project</span>
              </label>
            </div>

            <div className="modal-actions">
              <button type="button" className="primary" onClick={generateNewHalReport}>
                Generate bootstrap report
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewHalProjectName('')
                  setNewHalRepoUrl('')
                  setNewHalChecklist({ createdRepo: false, copiedScaffold: false, setEnv: false, addedToHalSuperProject: false })
                  setNewHalReport(null)
                  setNewHalTemplateRoot(null)
                  setNewHalTargetRoot(null)
                  setNewHalBootstrapLog(null)
                  setNewHalBootstrapError(null)
                }}
              >
                Reset
              </button>
            </div>

            <div className="wizard-v1">
              <p className="field-label">Wizard v1: copy scaffold (writes files)</p>
              <p className="wizard-help">
                Select the scaffold folder (recommended: this repo’s <code>hal-template/</code>) and a destination folder for your new project, then copy.
              </p>
              <div className="wizard-actions">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const dir = await pickWizardFolder('read')
                      setNewHalTemplateRoot(dir)
                      setNewHalBootstrapError(null)
                    } catch (e) {
                      setNewHalBootstrapError(e instanceof Error ? e.message : String(e))
                    }
                  }}
                >
                  Select scaffold folder
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const dir = await pickWizardFolder('readwrite')
                      setNewHalTargetRoot(dir)
                      setNewHalBootstrapError(null)
                    } catch (e) {
                      setNewHalBootstrapError(e instanceof Error ? e.message : String(e))
                    }
                  }}
                >
                  Select destination folder
                </button>
                <button type="button" className="primary" onClick={runWizardBootstrap}>
                  Copy scaffold
                </button>
              </div>

              <p className="wizard-status">
                Scaffold selected: {String(!!newHalTemplateRoot)} | Destination selected: {String(!!newHalTargetRoot)}
              </p>
              {newHalBootstrapError && (
                <p className="wizard-error" role="alert">
                  {newHalBootstrapError}
                </p>
              )}
              {newHalBootstrapLog && <pre className="report-pre">{newHalBootstrapLog}</pre>}
            </div>

            {newHalReport && (
              <div className="report">
                <p className="field-label">Bootstrap report</p>
                <pre className="report-pre">{newHalReport}</pre>
              </div>
            )}
          </div>
        </div>
      )}

      {showConfigMissingError && !connectError && (
        <div className="config-missing-error" role="alert">
          Not connected: missing Supabase config
        </div>
      )}

      {detailModal && (
        <TicketDetailModal
          open
          onClose={handleCloseTicketDetail}
          ticketId={detailModal.ticketId}
          title={detailModal.title}
          body={detailModalBody}
          loading={detailModalLoading}
          error={detailModalError}
          onRetry={detailModalError ? handleRetryTicketDetail : undefined}
          artifacts={detailModalArtifacts}
          artifactsLoading={detailModalArtifactsLoading}
          artifactsStatus={detailModalArtifactsStatus}
          onRefreshArtifacts={refreshDetailModalArtifacts}
          onOpenArtifact={handleOpenArtifact}
          columnId={detailModal.columnId}
          supabaseUrl={supabaseProjectUrl || ''}
          supabaseKey={supabaseAnonKey || ''}
          attachments={detailModalAttachments}
          attachmentsLoading={detailModalAttachmentsLoading}
          failureCounts={detailModalFailureCounts}
          onValidationPass={async (ticketPk: string) => {
            // Always use HAL's callbacks - HAL handles all database operations
            if (!halCtx) {
              throw new Error('HAL context not available - Kanban component must be used through HAL')
            }
            
            // Move ticket to Process Review using HAL's callback
            await halCtx.onMoveTicket(ticketPk, 'col-process-review')
            addLog(`Human validation: Ticket ${ticketPk} passed, moved to Process Review`)
            
            // HAL will update the data and pass it back, so we don't need to update local state
            // Close ticket detail modal after a short delay to show success message
            setTimeout(() => {
              handleCloseTicketDetail()
            }, 2000)
          }}
          onValidationFail={async (ticketPk: string, steps: string, notes: string) => {
            // Get current ticket (use sourceTickets which works in both library and Supabase modes)
            const ticket = sourceTickets.find((t) => t.pk === ticketPk)
            if (!ticket) {
              throw new Error('Ticket not found')
            }
            
            // Check if ticket is in Human in the Loop column (0130)
            const isInHumanInTheLoop = ticket.kanban_column_id === 'col-human-in-the-loop'
            
            // If in Human in the Loop, create/update QA artifact with FAIL verdict (0130)
            if (isInHumanInTheLoop) {
              // Use ticket_number for API call (numeric ID required by API)
              const ticketNumber = ticket.ticket_number
              const displayId = ticket.display_id || (ticketNumber ? String(ticketNumber).padStart(4, '0') : 'UNKNOWN')
              
              if (!ticketNumber) {
                console.warn('Ticket number not available, skipping QA artifact creation')
                addLog('Warning: Cannot create QA artifact - ticket number not available')
              } else {
                // Create QA report with FAIL verdict
                const qaReportBody = `# QA Report for ticket ${displayId}

## Ticket & deliverable
${ticket.title || 'N/A'}

## Human validation failure

**Verdict: FAIL**

This ticket failed human validation in the Human in the Loop phase.

**Steps to validate:**
${steps || '(none provided)'}

**Notes:**
${notes || '(none provided)'}

**Failure recorded:** ${new Date().toLocaleString()}

## Verdict

**FAIL** — Ticket failed human validation and has been moved back to To Do for rework.

QA RESULT: FAIL — ${displayId}
`
                
                try {
                  const qaResponse = await fetch('/api/artifacts/insert-qa', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      ticketId: String(ticketNumber),
                      title: `QA report for ticket ${displayId}`,
                      body_md: qaReportBody,
                    }),
                  })
                  
                  const qaResult = await qaResponse.json()
                  if (!qaResult.success) {
                    const errorMsg = qaResult.error || 'Unknown error'
                    const validationReason = qaResult.validation_reason || (qaResult.validation_failed ? 'Validation failed' : undefined)
                    const fullErrorMsg = validationReason 
                      ? `Failed to create QA artifact: ${errorMsg}. Validation reason: ${validationReason}`
                      : `Failed to create QA artifact: ${errorMsg}`
                    console.warn(`Failed to create QA artifact for ticket ${ticketNumber}:`, fullErrorMsg)
                    addLog(`Warning: ${fullErrorMsg}`)
                    // Continue with ticket update even if artifact creation fails
                  } else {
                    addLog(`QA artifact created/updated for ticket ${displayId} with FAIL verdict`)
                    // Refresh artifacts to show the new QA artifact
                    if (refreshDetailModalArtifacts) {
                      setTimeout(() => {
                        refreshDetailModalArtifacts()
                      }, 500)
                    }
                    
                    // Check for escalation to Process Review (0195)
                    // Trigger escalation check asynchronously (don't block the response)
                    setTimeout(async () => {
                      try {
                        const escalationResponse = await fetch('/api/tickets/check-failure-escalation', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            ticketPk: ticket.pk,
                            failureType: 'hitl',
                          }),
                        })
                        const escalationResult = await escalationResponse.json()
                        if (escalationResult.success && escalationResult.escalated) {
                          addLog(`Ticket ${displayId} escalated to Process Review (${escalationResult.hitl_fail_count} HITL failures)`)
                          if (escalationResult.suggestion_tickets && escalationResult.suggestion_tickets.length > 0) {
                            addLog(`Created ${escalationResult.suggestion_tickets.length} suggestion ticket(s): ${escalationResult.suggestion_tickets.join(', ')}`)
                          }
                        }
                      } catch (err) {
                        // Log but don't fail - escalation check is best effort
                        console.warn(`[HITL validation] Escalation check error: ${err instanceof Error ? err.message : String(err)}`)
                      }
                    }, 200)
                  }
                } catch (err) {
                  console.error('Error creating QA artifact:', err)
                  addLog(`Warning: Error creating QA artifact: ${err instanceof Error ? err.message : String(err)}`)
                  // Continue with ticket update even if artifact creation fails
                }
              }
            }
            
            // Prepend human feedback to body (visually emphasized)
            const feedbackSection = `## ⚠️ Human Feedback (${new Date().toLocaleString()})

**Validation failed** — Ticket moved back to To Do for rework.

**Steps to validate:**
${steps || '(none provided)'}

**Notes:**
${notes || '(none provided)'}

---

`
            const updatedBody = feedbackSection + ticket.body_md
            
            // Always use HAL's callbacks - HAL handles all database operations
            if (!halCtx) {
              throw new Error('HAL context not available - Kanban component must be used through HAL')
            }
            
            // Move ticket to To Do using HAL's callback
            await halCtx.onMoveTicket(ticketPk, 'col-todo')
            
            // Update ticket body using HAL's callback
            if (halCtx.onUpdateTicketBody) {
              await halCtx.onUpdateTicketBody(ticketPk, updatedBody)
            } else {
              console.warn('onUpdateTicketBody not available in HAL context')
              addLog('Warning: Ticket body update not available - column move succeeded')
            }
            
            addLog(`Human validation: Ticket ${ticketPk} failed, moved to To Do with feedback`)
            
            // HAL will update the data and pass it back, so we don't need to update local state
            // Close ticket detail modal after a short delay to show success message
            setTimeout(() => {
              handleCloseTicketDetail()
            }, 2000)
          }}
          onTicketUpdate={refetchSupabaseTickets}
        />
      )}

      <ArtifactReportViewer
        open={artifactViewer !== null}
        onClose={handleCloseArtifact}
        artifact={artifactViewer}
        artifacts={detailModalArtifacts}
        currentIndex={artifactViewerIndex}
        onNavigate={handleNavigateArtifact}
      />

      {/* Active work row: shows tickets in Doing column (0145) - positioned above DndContext */}
      {supabaseBoardActive && (
        <section className="active-work-row" aria-label="Active work">
          <h2 className="active-work-title">Active work</h2>
          <div className="active-work-items">
            {doingTickets.length > 0 ? (
              doingTickets.map((ticket) => {
                // Use simple string storage from button click (0135) - no DB lookup
                const agentName = activeWorkAgentTypes[ticket.pk] || null
                // Get agent run data from context (0203)
                const agentRun = halCtx?.agentRunsByTicketPk?.[ticket.pk] || agentRunsByTicketPk[ticket.pk]
                const timestamp = ticket.kanban_moved_at
                  ? new Date(ticket.kanban_moved_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : ticket.updated_at
                  ? new Date(ticket.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : null
                const displayId = ticket.display_id || (ticket.ticket_number ? `HAL-${String(ticket.ticket_number).padStart(4, '0')}` : null)
                const ticketIdentifier = displayId ? `${displayId}: ${ticket.title}` : ticket.title
                
                return (
                  <div
                    key={ticket.pk}
                    className="active-work-item"
                    onClick={() => handleOpenTicketDetail(ticket.pk)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleOpenTicketDetail(ticket.pk)
                      }
                    }}
                    aria-label={`Open ticket ${ticketIdentifier}`}
                  >
                    <div className="active-work-item-title">{ticketIdentifier}</div>
                    <div className="active-work-item-meta">
                      <span className="active-work-item-agent">{agentName || 'Unassigned'}</span>
                      <div className="active-work-item-status-row">
                        <StatusIndicator agentRun={agentRun} agentName={agentName} />
                        {timestamp && (
                          <span className="active-work-item-timestamp" title={`Updated ${timestamp}`}>
                            {timestamp}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="active-work-empty">No active work</div>
            )}
          </div>
        </section>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <section className="columns-section" aria-label="Columns">
          {!isEmbedded && (
            <>
              <button
                type="button"
                className="add-column-btn"
                onClick={() => {
                  setAddColumnError(null)
                  setShowAddColumnForm(true)
                }}
                aria-expanded={showAddColumnForm}
              >
                Add column
              </button>
              {showAddColumnForm && (
                <div className="add-column-form" role="form" aria-label="Add column form">
                  <input
                    type="text"
                    value={newColumnTitle}
                    onChange={(e) => {
                      setNewColumnTitle(e.target.value)
                      setAddColumnError(null)
                    }}
                    placeholder="Column name"
                    autoFocus
                    aria-label="Column name"
                    aria-invalid={!!addColumnError}
                    aria-describedby={addColumnError ? 'add-column-error' : undefined}
                  />
                  {addColumnError && (
                    <p id="add-column-error" className="add-column-error" role="alert">
                      {addColumnError}
                    </p>
                  )}
                  <div className="form-actions">
                    <button type="button" onClick={handleCreateColumn}>
                      Create
                    </button>
                    <button type="button" onClick={handleCancelAddColumn}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          <SortableContext
            items={columnsForDisplay.map((c) => c.id)}
            strategy={horizontalListSortingStrategy}
          >
            <div className="columns-row">
              {columnsForDisplay.map((col) => (
                <SortableColumn
                  key={col.id}
                  col={col}
                  cards={cardsForDisplay}
                  onRemove={handleRemoveColumn}
                  hideRemove={supabaseBoardActive}
                  onOpenDetail={handleOpenTicketDetail}
                  supabaseBoardActive={supabaseBoardActive}
                  supabaseColumns={supabaseColumns}
                  supabaseTickets={supabaseTickets}
                  updateSupabaseTicketKanban={updateSupabaseTicketKanban}
                  refetchSupabaseTickets={refetchSupabaseTickets}
                  pendingMoves={pendingMoves}
                  fetchActiveAgentRuns={fetchActiveAgentRuns}
                  setActiveWorkAgentTypes={setActiveWorkAgentTypes}
                  activeWorkAgentTypes={activeWorkAgentTypes}
                />
              ))}
            </div>
          </SortableContext>
        </section>

        <DragOverlay>
          {activeCardId && cardsForDisplay[String(activeCardId)] ? (
            <div className="ticket-card" data-card-id={activeCardId}>
              <div className="ticket-card-top-row">
                <span className="ticket-card-drag-handle" aria-hidden />
                <span className="ticket-card-title">{cardsForDisplay[String(activeCardId)].title}</span>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {!isEmbedded && (
        <button type="button" className="debug-toggle" onClick={toggleDebug} aria-pressed={debugOpen}>
          Debug {debugOpen ? 'ON' : 'OFF'}
        </button>
      )}

      {debugOpen && (
        <div className="debug-panel" role="region" aria-label="Debug panel">
          <section>
            <h3>Build info</h3>
            <div className="build-info">
              Mode: {import.meta.env.MODE ?? 'unknown'}
            </div>
          </section>
          <section>
            <h3>Kanban state</h3>
            <div className="build-info">
              <p className="kanban-summary">Column count: {columnsForDisplay.length}</p>
              <p className="kanban-column-order">
                Column order: {columnOrderDisplay}
              </p>
              <p className="kanban-cards-per-column">
                Cards per column: {kanbanCardsDisplay}
              </p>
            </div>
          </section>
          <section>
            <h3>Ticket Store (Supabase-only)</h3>
            <div className="build-info">
              <p className="debug-mode-indicator" role="status">
                Mode: <strong>Supabase-only</strong> (file system mode removed in 0065)
              </p>
              {supabaseConfigMissing && (
                <p className="debug-env-missing" role="alert">
                  <strong>Error:</strong> Missing env: {[!envUrl && 'VITE_SUPABASE_URL', !envKey && 'VITE_SUPABASE_ANON_KEY'].filter(Boolean).join(', ') || 'none'}
                </p>
              )}
              <p>Connected: {String(supabaseConnectionStatus === 'connected')}</p>
              <p>Project URL present: {String(!!supabaseProjectUrl.trim())}</p>
              <p>Polling: {supabaseBoardActive ? `${SUPABASE_POLL_INTERVAL_MS / 1000}s` : 'off'}</p>
              <p>Last tickets refresh: {supabaseLastRefresh ? supabaseLastRefresh.toLocaleTimeString() : 'never'}</p>
              <p>Last poll error: {supabaseLastError ?? 'none'}</p>
              {/* Ticket persistence status (0047) */}
              {lastMovePersisted ? (
                <p className={lastMovePersisted.success ? 'debug-success' : 'debug-error'}>
                  Last move {lastMovePersisted.success ? 'persisted' : 'failed'}: ticket {lastMovePersisted.ticketId} at {lastMovePersisted.timestamp.toLocaleTimeString()}
                  {lastMovePersisted.error && ` - ${lastMovePersisted.error}`}
                </p>
              ) : (
                <p>Last move persisted/failed: none</p>
              )}
              {pendingMoves.size > 0 && (
                <p className="debug-warning">
                  Pending moves: {Array.from(pendingMoves).join(', ')}
                </p>
              )}
              {supabaseBoardActive && (
                <>
                  <p>Columns source: Supabase</p>
                  <p>Column count: {supabaseColumnsRows.length}</p>
                  <p>Last columns refresh: {supabaseColumnsLastRefresh ? supabaseColumnsLastRefresh.toISOString() : 'never'}</p>
                  <p>Last columns error: {supabaseColumnsLastError ?? 'none'}</p>
                  {supabaseUnknownColumnTicketIds.length > 0 && (
                    <p className="debug-unknown-columns" role="status">
                      Tickets with unknown column (moved to first): {supabaseUnknownColumnTicketIds.join(', ')}
                    </p>
                  )}
                </>
              )}
              <p className="kanban-column-ticket-ids">Per-column ticket IDs: {kanbanColumnTicketIdsDisplay}</p>
            </div>
          </section>
          {/* File system mode removed (0065): selectedTicketPath debug section removed */}
          <section>
            <h3>Action Log</h3>
            <p className="action-log-summary">Total actions: {actionLog.length}</p>
            <ul>
              {actionLog.length === 0 ? (
                <li>No actions yet.</li>
              ) : (
                actionLog.map((e) => (
                  <li key={e.id}>
                    [{e.at}] {e.message}
                  </li>
                ))
              )}
            </ul>
          </section>
          <section>
            <h3>Errors</h3>
            <div className={`error-section ${runtimeError ? '' : 'empty'}`}>
              {runtimeError ?? 'No errors.'}
            </div>
          </section>
        </div>
      )}
    </>
  )
}

export default App
