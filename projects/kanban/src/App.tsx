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
  useDroppable,
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
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  parseFrontmatter,
} from './frontmatter'
import { createClient } from '@supabase/supabase-js'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import { GitDiffViewer } from './GitDiffViewer'

type LogEntry = { id: number; message: string; at: string }
type Card = { id: string; title: string; /** Display id for work button (e.g. HAL-0081); when card id is Supabase pk, used for message. */ displayId?: string }
type Column = { id: string; title: string; cardIds: string[] }

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

/** Supabase agent_artifacts table row (0082) */
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

/** Supabase ticket_attachments table row (0092) */
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

/** First 4 digits from filename (e.g. 0009-...md → 0009). Invalid → null. */
function extractTicketId(filename: string): string | null {
  const match = filename.match(/^(\d{4})/)
  return match ? match[1] : null
}

/** Extract feature branch name from ticket body_md QA section. Returns branch name or null. */
function extractFeatureBranch(bodyMd: string | null): string | null {
  if (!bodyMd) return null
  // Look for "**Branch**: `branch-name`" or "- **Branch**: `branch-name`" in QA section
  const branchMatch = bodyMd.match(/(?:^|\n)(?:- )?\*\*Branch\*\*:\s*`([^`]+)`/i)
  return branchMatch ? branchMatch[1].trim() : null
}

/** Strip embedded QA blocks (markdown and raw HTML) from body; QA is represented by artifacts only. */
function stripQAInformationBlockFromBody(bodyMd: string): string {
  if (!bodyMd || !bodyMd.trim()) return bodyMd
  const lines = bodyMd.split('\n')
  const out: string[] = []
  let inQABlock = false
  let inQAHtmlBlock = false
  let htmlDepth = 0
  const qaDivOpen = /<div[^>]*class=["'][^"']*qa-(info-section|section|workflow-section)(?:\s[^"']*)?["'][^>]*>/i
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (inQAHtmlBlock) {
      const opens = (line.match(/<div[^>]*>/gi) || []).length
      const closes = (line.match(/<\/div\s*>/gi) || []).length
      htmlDepth += opens - closes
      if (htmlDepth <= 0) inQAHtmlBlock = false
      continue
    }
    if (qaDivOpen.test(line)) {
      inQAHtmlBlock = true
      htmlDepth = 1
      const closes = (line.match(/<\/div\s*>/gi) || []).length
      htmlDepth -= closes
      if (htmlDepth <= 0) inQAHtmlBlock = false
      continue
    }
    const looksLikeQAHeading =
      /^#{1,6}\s*QA\b/i.test(trimmed) ||
      /\*\*QA\s+Information\*\*/i.test(trimmed) ||
      /^<h[1-6][^>]*>[\s\S]*QA\s+Information[\s\S]*<\/h[1-6]>/i.test(trimmed) ||
      (/QA\s+Information/i.test(trimmed) && (trimmed.length < 50 || /^#?\s*\*?\*?/.test(trimmed)))
    const isOtherSectionHeading =
      /^#{1,6}\s/.test(trimmed) &&
      !/^#{1,6}\s*QA\b/i.test(trimmed) &&
      !/^#{1,6}\s*Implementation\s+artifacts\s*:?\s*$/i.test(trimmed)
    if (looksLikeQAHeading) {
      inQABlock = true
      continue
    }
    if (inQABlock) {
      if (isOtherSectionHeading) {
        inQABlock = false
        out.push(line)
      }
      continue
    }
    out.push(line)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Check if ticket body_md indicates branch was merged to main. Returns { merged: boolean, timestamp: string | null }. */
function checkMergedToMain(bodyMd: string | null): { merged: boolean; timestamp: string | null } {
  if (!bodyMd) return { merged: false, timestamp: null }
  
  // Look for "Merged to main" confirmation in QA section or anywhere in body
  const mergedPatterns = [
    /(?:^|\n)(?:- )?\*\*Merged to main\*\*:\s*Yes/i,
    /(?:^|\n)(?:- )?\*\*Merged to main\*\*:\s*✅/i,
    /merged to main for (?:cloud )?qa access/i,
    /merged.*main.*qa/i,
    /Merged to main:\s*Yes/i,
    /Merged to main:\s*✅/i,
  ]
  
  const hasMerged = mergedPatterns.some(pattern => pattern.test(bodyMd))
  
  // Try to extract timestamp if present (look for ISO date or common date formats near "merged" text)
  const timestampMatch = bodyMd.match(/(?:merged|Merged).*?(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}|[\d\/]+\s+[\d:]+)/i)
  const timestamp = timestampMatch ? timestampMatch[1] : null
  
  return { merged: hasMerged, timestamp }
}

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

/** Normalize Title line in body_md to include ID prefix: "<ID> — <title>". Returns { normalized, wasNormalized }. */
function normalizeTitleLineInBody(bodyMd: string, ticketId: string): { normalized: string; wasNormalized: boolean } {
  if (!bodyMd || !ticketId) return { normalized: bodyMd, wasNormalized: false }
  const idPrefix = `${ticketId} — `
  // Match the Title line: "- **Title**: ..."
  const titleLineRegex = /(- \*\*Title\*\*:\s*)(.+?)(?:\n|$)/
  const match = bodyMd.match(titleLineRegex)
  if (!match) return { normalized: bodyMd, wasNormalized: false } // No Title line found, return as-is
  
  const prefix = match[1] // "- **Title**: "
  let titleValue = match[2].trim()
  
  // Check if already has correct ID prefix
  if (titleValue.startsWith(idPrefix)) {
    return { normalized: bodyMd, wasNormalized: false }
  }
  
  // Remove any existing ID prefix (e.g. "0048 — " or "HAL-0048 - ")
  titleValue = titleValue.replace(/^(?:[A-Za-z0-9]{2,10}-)?\d{4}\s*[—–-]\s*/, '')
  
  // Prepend the correct ID prefix
  const normalizedTitle = `${idPrefix}${titleValue}`
  const normalizedLine = `${prefix}${normalizedTitle}${match[0].endsWith('\n') ? '\n' : ''}`
  const normalized = bodyMd.replace(titleLineRegex, normalizedLine)
  
  return { normalized, wasNormalized: true }
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

/** Auto-dismiss component for success messages (0047) */
function AutoDismissMessage({ onDismiss, delay }: { onDismiss: () => void; delay: number }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, delay)
    return () => clearTimeout(timer)
  }, [onDismiss, delay])
  return null
}

function stableColumnId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `col-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase()
}

/** Best-effort priority from frontmatter or body (e.g. **Priority**: P1 or # Priority) */
function extractPriority(frontmatter: Record<string, string>, body: string): string | null {
  const p = frontmatter.Priority ?? frontmatter.priority
  if (p && p.trim()) return p.trim()
  const m = body.match(/\*\*Priority\*\*:\s*(\S+)/)
  if (m) return m[1]
  const m2 = body.match(/# Priority\s*\n\s*(\S+)/)
  if (m2) return m2[1]
  return null
}


/** Get display name for agent type (0082) */
function getAgentTypeDisplayName(agentType: string): string {
  switch (agentType) {
    case 'implementation':
      return 'Implementation report'
    case 'qa':
      return 'QA report'
    case 'human-in-the-loop':
      return 'Human-in-the-Loop report'
    case 'other':
      return 'Other agent report'
    default:
      return `${agentType} report`
  }
}

/** Image viewer modal for full-size image display (0158) */
function ImageViewerModal({
  open,
  onClose,
  imageSrc,
  imageAlt,
}: {
  open: boolean
  onClose: () => void
  imageSrc: string | null
  imageAlt: string
}) {
  const modalRef = useRef<HTMLDivElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!open || !modalRef.current) return
    const el = closeBtnRef.current ?? modalRef.current.querySelector<HTMLElement>('button, [href]')
    el?.focus()
  }, [open])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
    },
    [onClose]
  )

  if (!open || !imageSrc) return null

  return (
    <div
      className="ticket-detail-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={handleKeyDown}
    >
      <div className="ticket-detail-modal" ref={modalRef} style={{ maxWidth: '90vw', maxHeight: '90vh', padding: '1rem' }}>
        <div className="ticket-detail-header">
          <h2 id="image-viewer-title" className="ticket-detail-title" style={{ fontSize: '1.25rem' }}>
            {imageAlt || 'Image'}
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
        <div className="ticket-detail-body-wrap" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem' }}>
          <img
            src={imageSrc}
            alt={imageAlt}
            style={{
              maxWidth: '100%',
              maxHeight: 'calc(90vh - 100px)',
              objectFit: 'contain',
              borderRadius: '4px',
            }}
            onError={(e) => {
              const target = e.currentTarget
              target.style.display = 'none'
              const parent = target.parentElement
              if (parent) {
                const errorMsg = document.createElement('p')
                errorMsg.textContent = `Unable to display image: ${imageAlt || 'Unknown image'}`
                errorMsg.style.color = 'var(--kanban-error)'
                errorMsg.style.padding = '2rem'
                errorMsg.style.textAlign = 'center'
                parent.appendChild(errorMsg)
              }
            }}
          />
        </div>
      </div>
    </div>
  )
}

/** Custom image component for ReactMarkdown (0158) */
function MarkdownImage({
  src,
  alt,
  artifactTitle,
  onImageClick,
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement> & {
  src?: string
  alt?: string
  artifactTitle?: string
  onImageClick: (src: string, alt: string) => void
}) {
  const [imageError, setImageError] = useState(false)
  const imageSrc = src || null
  
  // Handle image load error
  const handleError = useCallback(() => {
    console.warn('[MarkdownImage] Image failed to load:', imageSrc?.substring(0, 100))
    setImageError(true)
  }, [imageSrc])

  // Debug: log what we received
  useEffect(() => {
    if (imageSrc) {
      console.log('[MarkdownImage] Component mounted with src:', imageSrc.substring(0, 100) + '...', 'alt:', alt)
    } else {
      console.warn('[MarkdownImage] Component mounted WITHOUT src. Props:', { src, alt, hasSrc: !!src })
    }
  }, []) // Only log on mount

  // If no src at all, show fallback immediately
  if (!imageSrc) {
    return (
      <div
        style={{
          padding: '1rem',
          border: '1px solid var(--kanban-border)',
          borderRadius: '4px',
          backgroundColor: 'var(--kanban-surface-alt)',
          color: 'var(--kanban-text-muted)',
          textAlign: 'center',
        }}
      >
        <p style={{ margin: 0 }}>
          No image source provided: {alt || artifactTitle || 'Unknown image'}
        </p>
        <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--kanban-text-subtle)' }}>
          Debug: src={String(src)}, alt={String(alt)}
        </p>
      </div>
    )
  }

  // If image failed to load, show fallback
  if (imageError) {
    return (
      <div
        style={{
          padding: '1rem',
          border: '1px solid var(--kanban-border)',
          borderRadius: '4px',
          backgroundColor: 'var(--kanban-surface-alt)',
          color: 'var(--kanban-text-muted)',
          textAlign: 'center',
        }}
      >
        <p style={{ margin: 0 }}>
          Unable to display image: {alt || artifactTitle || 'Unknown image'}
        </p>
      </div>
    )
  }

  return (
    <div style={{ margin: '1rem 0', textAlign: 'center' }}>
      <img
        {...props}
        src={imageSrc}
        alt={alt || artifactTitle || 'Image'}
        onClick={() => onImageClick(imageSrc, alt || artifactTitle || 'Image')}
        onError={handleError}
        onLoad={() => console.log('[MarkdownImage] Image loaded successfully:', imageSrc?.substring(0, 50) + '...')}
        style={{
          maxWidth: '100%',
          height: 'auto',
          cursor: 'pointer',
          borderRadius: '4px',
          border: '1px solid var(--kanban-border)',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        }}
        title="Click to view full size"
      />
      {alt && (
        <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: 'var(--kanban-text-muted)', fontStyle: 'italic' }}>
          {alt}
        </p>
      )}
    </div>
  )
}

/** Artifact report viewer modal (0082) */
function ArtifactReportViewer({
  open,
  onClose,
  artifact,
}: {
  open: boolean
  onClose: () => void
  artifact: SupabaseAgentArtifactRow | null
}) {
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
    const normalizedTitle = artifact.title.toLowerCase().trim()
    return normalizedTitle.startsWith('git diff for ticket') || normalizedTitle.startsWith('git-diff for ticket')
  }, [artifact])

  if (!open || !artifact) return null

  const createdAt = new Date(artifact.created_at)
  const displayName = getAgentTypeDisplayName(artifact.agent_type)

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
            {artifact.title}
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
            {artifact.body_md && artifact.body_md.trim().length > 0 ? (
              isGitDiff ? (
                <GitDiffViewer diff={artifact.body_md} />
              ) : (
                <ReactMarkdown components={markdownComponents}>{artifact.body_md}</ReactMarkdown>
              )
            ) : (
              <p className="ticket-detail-empty" style={{ fontStyle: 'italic', color: '#666' }}>
                {isGitDiff 
                  ? 'No diff available. This artifact was created but contains no diff content.'
                  : 'No output produced. This artifact was created but contains no content.'}
              </p>
            )}
          </div>
        </div>
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
function HumanValidationSection({
  ticketId: _ticketId,
  ticketPk: _ticketPk,
  stepsToValidate,
  notes,
  onStepsChange,
  onNotesChange,
  onPass,
  onFail,
  isProcessing,
}: {
  ticketId: string
  ticketPk: string
  stepsToValidate: string
  notes: string
  onStepsChange: (value: string) => void
  onNotesChange: (value: string) => void
  onPass: () => void
  onFail: () => void
  isProcessing: boolean
}) {
  return (
    <div className="human-validation-section">
      <h3 className="human-validation-title">Human validation</h3>
      <div className="human-validation-fields">
        <label className="human-validation-field">
          <span className="human-validation-label">Steps to validate</span>
          <textarea
            className="human-validation-textarea"
            value={stepsToValidate}
            onChange={(e) => onStepsChange(e.target.value)}
            placeholder="Enter validation steps (one per line or freeform text)"
            rows={4}
            disabled={isProcessing}
          />
        </label>
        <label className="human-validation-field">
          <span className="human-validation-label">Notes</span>
          <textarea
            className="human-validation-textarea"
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Enter any notes or feedback"
            rows={4}
            disabled={isProcessing}
          />
        </label>
      </div>
      <div className="human-validation-actions">
        <button
          type="button"
          className="human-validation-button human-validation-button-pass"
          onClick={onPass}
          disabled={isProcessing}
        >
          Pass
        </button>
        <button
          type="button"
          className="human-validation-button human-validation-button-fail"
          onClick={onFail}
          disabled={isProcessing}
        >
          Fail
        </button>
      </div>
    </div>
  )
}

/** Process Review section component (0094) */
function ProcessReviewSection({
  ticketId,
  ticketPk,
  artifacts,
  supabaseUrl,
  supabaseAnonKey,
}: {
  ticketId: string
  ticketPk: string
  artifacts: SupabaseAgentArtifactRow[]
  supabaseUrl?: string
  supabaseAnonKey?: string
}) {
  const halCtx = useContext(HalKanbanContext)
  const [suggestions, setSuggestions] = useState<Array<{ id: string; text: string; justification: string; selected: boolean }>>([])
  const [lastRunStatus, setLastRunStatus] = useState<{ timestamp: string; success: boolean; error?: string } | null>(null)
  const [isCreatingTicket, setIsCreatingTicket] = useState(false)
  const [createdTicketId, setCreatedTicketId] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  
  // Check if Process Review is currently running for this ticket (from column header button)
  const isRunningReview = halCtx?.processReviewRunningForTicketPk === ticketPk

  // Load last run status from database on mount and when review completes
  const loadLastRunStatus = React.useCallback(async () => {
    if (!supabaseUrl || !supabaseAnonKey || !ticketPk) return

    try {
      const supabase = createClient(supabaseUrl, supabaseAnonKey)
      const { data, error } = await supabase
        .from('process_reviews')
        .select('created_at, status, error_message, suggestions')
        .eq('ticket_pk', ticketPk)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        console.error('Failed to load process review status:', error)
        return
      }

      if (data) {
        setLastRunStatus({
          timestamp: data.created_at,
          success: data.status === 'success',
          error: data.error_message || undefined,
        })

        // Load suggestions if available
        if (data.suggestions && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
          const loadedSuggestions = data.suggestions.map((s: string | { text: string; justification?: string }, i: number) => {
            if (typeof s === 'string') {
              return {
                id: `suggestion-${i}`,
                text: s,
                justification: 'No justification provided.',
                selected: false,
              }
            } else {
              return {
                id: `suggestion-${i}`,
                text: s.text || '',
                justification: s.justification || 'No justification provided.',
                selected: false,
              }
            }
          })
          setSuggestions(loadedSuggestions)
        } else {
          // Clear suggestions if no data
          setSuggestions([])
        }
      } else {
        // No review data found
        setLastRunStatus(null)
        setSuggestions([])
      }
    } catch (err) {
      console.error('Error loading process review status:', err)
    }
  }, [supabaseUrl, supabaseAnonKey, ticketPk])

  // Load on mount and when ticketPk changes
  useEffect(() => {
    loadLastRunStatus()
  }, [loadLastRunStatus])

  // Refresh when review completes (isRunningReview changes from true to false)
  const prevIsRunningReview = React.useRef(isRunningReview)
  useEffect(() => {
    if (prevIsRunningReview.current && !isRunningReview) {
      // Review just completed, refresh data
      loadLastRunStatus()
    }
    prevIsRunningReview.current = isRunningReview
  }, [isRunningReview, loadLastRunStatus])

  const handleToggleSuggestion = (id: string) => {
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, selected: !s.selected } : s))
    )
  }

  const handleCreateTicket = async () => {
    const selectedSuggestions = suggestions.filter((s) => s.selected)
    if (selectedSuggestions.length === 0) {
      setCreateError('Please select at least one suggestion')
      return
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      setCreateError('Supabase not configured. Connect to Supabase to create ticket.')
      return
    }

    setIsCreatingTicket(true)
    setCreateError(null)
    setCreatedTicketId(null)

    try {
      const response = await fetch('/api/tickets/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceTicketId: ticketId,
          sourceTicketPk: ticketPk,
          suggestions: selectedSuggestions.map((s) => s.text),
          supabaseUrl,
          supabaseAnonKey,
        }),
      })

      const result = await response.json()

      if (!result.success) {
        setCreateError(result.error || 'Failed to create ticket')
        return
      }

      setCreatedTicketId(result.ticketId || result.id || 'Unknown')
      // Clear selections after successful creation
      setSuggestions((prev) => prev.map((s) => ({ ...s, selected: false })))
      
      // Immediately refresh tickets to show the new ticket (0133)
      if (halCtx?.onTicketCreated) {
        // Library mode: HAL provides callback to refresh its data
        try {
          await halCtx.onTicketCreated()
        } catch (err) {
          console.warn('[Kanban] Failed to refresh tickets after creation:', err)
          // Non-blocking: continue normal polling
        }
      } else if (typeof window !== 'undefined' && window.parent !== window.self) {
        // Embedded iframe mode: notify parent via postMessage
        try {
          window.parent.postMessage({ type: 'HAL_TICKET_CREATED' }, '*')
        } catch (err) {
          console.warn('[Kanban] Failed to notify parent of ticket creation:', err)
        }
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create ticket')
    } finally {
      setIsCreatingTicket(false)
    }
  }

  return (
    <div className="process-review-section">
      <h3 className="process-review-title">Process Review</h3>
      
      <div className="process-review-artifacts">
        <h4 className="process-review-subtitle">Artifacts</h4>
        {artifacts.length === 0 ? (
          <p className="process-review-empty">No artifacts available for this ticket.</p>
        ) : (
          <ul className="process-review-artifacts-list">
            {artifacts.map((artifact) => {
              const displayName = artifact.title || getAgentTypeDisplayName(artifact.agent_type)
              return (
                <li key={artifact.artifact_id} className="process-review-artifact-item">
                  <span className="process-review-artifact-name">{displayName}</span>
                  <span className="process-review-artifact-meta">
                    {new Date(artifact.created_at).toLocaleString()}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {isRunningReview && (
        <div className="process-review-last-run" role="status">
          <p>
            <strong>Status:</strong>{' '}
            <span className="process-review-status-running">⏳ Process Review in progress...</span>
          </p>
        </div>
      )}

      {!isRunningReview && lastRunStatus && (
        <div className="process-review-last-run" role="status">
          <p>
            <strong>Last run:</strong>{' '}
            {new Date(lastRunStatus.timestamp).toLocaleString()}{' '}
            {lastRunStatus.success ? (
              <span className="process-review-status-success">✓ Success</span>
            ) : (
              <span className="process-review-status-failed">✗ Failed</span>
            )}
            {lastRunStatus.error && (
              <span className="process-review-error-detail"> — {lastRunStatus.error}</span>
            )}
          </p>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="process-review-suggestions">
          <h4 className="process-review-subtitle">Suggested improvements</h4>
          <ul className="process-review-suggestions-list">
            {suggestions.map((suggestion) => (
              <li key={suggestion.id} className="process-review-suggestion-item">
                <label className="process-review-suggestion-label">
                  <input
                    type="checkbox"
                    checked={suggestion.selected}
                    onChange={() => handleToggleSuggestion(suggestion.id)}
                    disabled={isCreatingTicket}
                  />
                  <div className="process-review-suggestion-content">
                    <span className="process-review-suggestion-text">{suggestion.text}</span>
                    {suggestion.justification && (
                      <span className="process-review-suggestion-justification">{suggestion.justification}</span>
                    )}
                  </div>
                </label>
              </li>
            ))}
          </ul>
          <div className="process-review-create-actions">
            <button
              type="button"
              className="process-review-button process-review-button-create"
              onClick={handleCreateTicket}
              disabled={isCreatingTicket || suggestions.filter((s) => s.selected).length === 0}
            >
              {isCreatingTicket ? 'Creating ticket...' : 'Create ticket'}
            </button>
          </div>
        </div>
      )}

      {createError && (
        <div className="process-review-error" role="alert">
          <p>{createError}</p>
        </div>
      )}

      {createdTicketId && (
        <div className="process-review-success" role="alert">
          <p>
            <strong>Ticket created:</strong> {createdTicketId}
          </p>
        </div>
      )}
    </div>
  )
}

/** Artifacts section component (0082) with error state detection (0137) */
function ArtifactsSection({
  artifacts,
  loading,
  onOpenArtifact,
  statusMessage = null,
  onRefresh: _onRefresh = undefined,
  refreshing = false,
  columnId = null,
}: {
  artifacts: SupabaseAgentArtifactRow[]
  loading: boolean
  onOpenArtifact: (artifact: SupabaseAgentArtifactRow) => void
  statusMessage?: string | null
  onRefresh?: () => void
  refreshing?: boolean
  columnId?: string | null
}) {
  const isLoading = loading || refreshing

  // Detect missing expected artifacts for implementation tickets in QA or later columns (0137)
  const isImplementationTicket = artifacts.some((a) => a.agent_type === 'implementation')
  const isInQaOrLater = columnId === 'col-qa' || columnId === 'col-human-in-the-loop' || columnId === 'col-process-review'
  const hasChangedFiles = artifacts.some((a) => 
    a.title?.toLowerCase().includes('changed files') && 
    a.agent_type === 'implementation' &&
    a.body_md && 
    a.body_md.trim().length > 0 &&
    !a.body_md.includes('(No files changed in this PR)') &&
    !a.body_md.includes('(none)')
  )
  const hasVerification = artifacts.some((a) => 
    a.title?.toLowerCase().includes('verification') && 
    a.agent_type === 'implementation' &&
    a.body_md && 
    a.body_md.trim().length > 0 &&
    !a.body_md.includes('(none)')
  )

  const missingChangedFiles = isImplementationTicket && isInQaOrLater && !hasChangedFiles
  const missingVerification = isImplementationTicket && isInQaOrLater && !hasVerification

  // Detect contradictory information (0137)
  const qaReport = artifacts.find((a) => 
    a.agent_type === 'qa' && 
    a.title?.toLowerCase().includes('qa report')
  )
  const hasContradiction = qaReport && qaReport.body_md && (
    (missingChangedFiles && qaReport.body_md.toLowerCase().includes('changed files')) ||
    (missingVerification && qaReport.body_md.toLowerCase().includes('verification'))
  )

  if (isLoading) {
    return (
      <div className="artifacts-section">
        <h3 className="artifacts-section-title">Artifacts</h3>
        <p className="artifacts-loading">Loading artifacts…</p>
        {statusMessage && <p className="artifacts-status" role="status">{statusMessage}</p>}
      </div>
    )
  }

  if (artifacts.length === 0) {
    return (
      <div className="artifacts-section">
        <h3 className="artifacts-section-title">Artifacts</h3>
        <p className="artifacts-empty">No artifacts available for this ticket.</p>
        {statusMessage && <p className="artifacts-status" role="status">{statusMessage}</p>}
      </div>
    )
  }

  // Sort all artifacts by created_at descending (most recent first)
  const sortedArtifacts = [...artifacts].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  return (
    <div className="artifacts-section">
      <h3 className="artifacts-section-title">Artifacts</h3>
      {statusMessage && <p className="artifacts-status" role="status">{statusMessage}</p>}
      
      {/* Warning banner for contradictory information (0137) */}
      {hasContradiction && (
        <div className="artifacts-warning-banner" role="alert">
          <strong>Warning:</strong> QA report references artifacts that are missing or unavailable. This may indicate a data synchronization issue.
        </div>
      )}

      {/* Error states for missing expected artifacts (0137) */}
      {missingChangedFiles && (
        <div className="artifacts-error-state" role="alert">
          <strong>Changed Files artifact unavailable:</strong> Unable to determine changed files. This may be due to missing PR/branch information or GitHub API failure.
        </div>
      )}
      {missingVerification && (
        <div className="artifacts-error-state" role="alert">
          <strong>Verification artifact unavailable:</strong> Unable to generate verification content. This may be due to missing PR/branch information or GitHub API failure.
        </div>
      )}

      <ul className="artifacts-list">
        {sortedArtifacts.map((artifact) => {
          // Use artifact title directly, or fall back to agent type display name
          const displayName = artifact.title || getAgentTypeDisplayName(artifact.agent_type)
          return (
            <li key={artifact.artifact_id} className="artifacts-item">
              <button
                type="button"
                className="artifacts-item-button"
                onClick={() => onOpenArtifact(artifact)}
                aria-label={`Open ${displayName}`}
              >
                <span className="artifacts-item-title">{displayName}</span>
                <span className="artifacts-item-meta">
                  {new Date(artifact.created_at).toLocaleString()}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Attachments Section: displays file attachments for tickets (0092) */
function AttachmentsSection({
  attachments,
  loading,
}: {
  attachments: TicketAttachment[]
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="attachments-section">
        <h3 className="attachments-section-title">Attachments</h3>
        <p className="attachments-loading">Loading attachments…</p>
      </div>
    )
  }

  if (attachments.length === 0) {
    return null // Don't show empty section
  }

  const handleDownload = (attachment: TicketAttachment) => {
    // Create a temporary anchor element to trigger download
    const link = document.createElement('a')
    link.href = attachment.data_url
    link.download = attachment.filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleView = (attachment: TicketAttachment) => {
    // Open in new tab for viewing
    window.open(attachment.data_url, '_blank')
  }

  const isImage = (mimeType: string) => mimeType.startsWith('image/')

  return (
    <div className="attachments-section">
      <h3 className="attachments-section-title">Attachments</h3>
      <ul className="attachments-list">
        {attachments.map((attachment) => (
          <li key={attachment.pk} className="attachments-item">
            <div className="attachments-item-content">
              {isImage(attachment.mime_type) && (
                <img
                  src={attachment.data_url}
                  alt={attachment.filename}
                  className="attachments-thumbnail"
                />
              )}
              <div className="attachments-item-info">
                <span className="attachments-item-filename">{attachment.filename}</span>
                <span className="attachments-item-meta">
                  {attachment.mime_type}
                  {attachment.file_size && ` • ${Math.round(attachment.file_size / 1024)} KB`}
                </span>
              </div>
            </div>
            <div className="attachments-item-actions">
              {isImage(attachment.mime_type) && (
                <button
                  type="button"
                  className="attachments-action-button"
                  onClick={() => handleView(attachment)}
                  aria-label={`View ${attachment.filename}`}
                >
                  View
                </button>
              )}
              <button
                type="button"
                className="attachments-action-button"
                onClick={() => handleDownload(attachment)}
                aria-label={`Download ${attachment.filename}`}
              >
                Download
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** QA Info Section: displays feature branch and implementation artifacts when ticket is in QA column (0113) */
function QAInfoSection({
  bodyMd,
  artifacts,
  artifactsLoading,
  onOpenArtifact,
}: {
  bodyMd: string | null
  artifacts: SupabaseAgentArtifactRow[]
  artifactsLoading: boolean
  onOpenArtifact: (artifact: SupabaseAgentArtifactRow) => void
}) {
  const featureBranch = extractFeatureBranch(bodyMd)
  const mergeStatus = checkMergedToMain(bodyMd)
  
  // Filter to implementation artifacts only
  const implementationArtifacts = artifacts.filter(a => a.agent_type === 'implementation')
  
  return (
    <div className="qa-info-section">
      <h3 className="qa-info-section-title">QA Information</h3>
      
      <div className="qa-info-field">
        <strong>Feature branch:</strong>{' '}
        {featureBranch ? (
          <code className="qa-branch-name">{featureBranch}</code>
        ) : (
          <span className="qa-missing">Not specified</span>
        )}
      </div>
      
      <div className="qa-info-field">
        <strong>Merged to main:</strong>{' '}
        {mergeStatus.merged ? (
          <span className="qa-merged-yes">
            ✅ Yes
            {mergeStatus.timestamp && (
              <span className="qa-merged-timestamp"> ({mergeStatus.timestamp})</span>
            )}
          </span>
        ) : (
          <span className="qa-merged-no">❌ No</span>
        )}
      </div>
      
      <div className="qa-info-field">
        <strong>Implementation artifacts:</strong>
        {artifactsLoading ? (
          <p className="qa-artifacts-loading">Loading artifacts…</p>
        ) : implementationArtifacts.length === 0 ? (
          <p className="qa-artifacts-empty">No implementation artifacts found.</p>
        ) : (
          <ul className="qa-artifacts-list">
            {implementationArtifacts
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .map((artifact) => {
                const displayName = artifact.title || getAgentTypeDisplayName(artifact.agent_type)
                return (
                  <li key={artifact.artifact_id} className="qa-artifacts-item">
                    <button
                      type="button"
                      className="qa-artifacts-item-button"
                      onClick={() => onOpenArtifact(artifact)}
                      aria-label={`Open ${displayName}`}
                    >
                      <span className="qa-artifacts-item-title">{displayName}</span>
                      <span className="qa-artifacts-item-meta">
                        {new Date(artifact.created_at).toLocaleString()}
                      </span>
                    </button>
                  </li>
                )
              })}
          </ul>
        )}
      </div>
      
      {!mergeStatus.merged && (
        <div className="qa-workflow-warning" role="alert">
          <strong>Warning:</strong> This ticket must be merged to main before it can be moved to Human in the Loop.
        </div>
      )}
    </div>
  )
}
/** Ticket detail modal (0033): title, metadata, markdown body, close/escape/backdrop, scroll lock, focus trap */
function TicketDetailModal({
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

function SortableCard({
  card,
  columnId,
  onOpenDetail,
  agentRun,
  isSaving = false,
}: {
  card: Card
  columnId: string
  onOpenDetail?: (cardId: string) => void
  agentRun?: SupabaseAgentRunRow | null
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
  // Show badge for Doing column tickets: agent name if working, "Unassigned" if not
  const showAgentBadge = columnId === 'col-doing'
  const agentName = agentRun?.agent_type === 'implementation' ? 'Implementation' : agentRun?.agent_type === 'qa' ? 'QA' : null
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

function SortableColumn({
  col,
  cards,
  onRemove,
  hideRemove = false,
  onOpenDetail,
  supabaseBoardActive = false,
  supabaseColumns = [],
  supabaseTickets = [],
  updateSupabaseTicketKanban,
  refetchSupabaseTickets,
  agentRunsByTicketPk = {},
  pendingMoves = new Set(),
  fetchActiveAgentRuns,
}: {
  col: Column
  cards: Record<string, Card>
  onRemove: (id: string) => void
  hideRemove?: boolean
  onOpenDetail?: (cardId: string) => void
  supabaseBoardActive?: boolean
  supabaseColumns?: Column[]
  supabaseTickets?: SupabaseTicketRow[]
  updateSupabaseTicketKanban?: (pk: string, updates: { kanban_column_id?: string; kanban_position?: number; kanban_moved_at?: string }) => Promise<{ ok: true } | { ok: false; error: string }>
  refetchSupabaseTickets?: (skipPendingMoves?: boolean) => Promise<boolean>
  agentRunsByTicketPk?: Record<string, SupabaseAgentRunRow>
  pendingMoves?: Set<string>
  fetchActiveAgentRuns?: () => Promise<void>
}) {
  const halCtx = useContext(HalKanbanContext)
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: col.id,
    data: { type: 'column' },
  })
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: col.id,
    data: { type: 'column-drop', columnId: col.id },
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  // Has tickets: column has cards (cardIds may be Supabase pk UUIDs, so don't rely on extractTicketId)
  const hasTickets = col.cardIds.length > 0
  const firstCard = hasTickets ? cards[col.cardIds[0]] : null
  const topTicketId = firstCard ? (firstCard.displayId ?? extractTicketId(firstCard.id) ?? null) : null

  // Determine if this column should show a work button
  const shouldShowWorkButton = col.id === 'col-unassigned' || col.id === 'col-todo' || col.id === 'col-qa' || col.id === 'col-process-review'
  
  const ticketRef = topTicketId ?? firstCard?.id ?? 'top'
  // Get button label and chat target based on column
  const getButtonConfig = () => {
    if (col.id === 'col-unassigned') {
      return { label: 'Prepare top ticket', chatTarget: 'project-manager' as const, message: `Please prepare ticket ${ticketRef} and get it ready (Definition of Ready).` }
    } else if (col.id === 'col-todo') {
      return { label: 'Implement top ticket', chatTarget: 'implementation-agent' as const, message: `Implement ticket ${ticketRef}.` }
    } else if (col.id === 'col-qa') {
      return { label: 'QA top ticket', chatTarget: 'qa-agent' as const, message: `QA ticket ${ticketRef}.` }
    } else if (col.id === 'col-process-review') {
      return { label: 'Review top ticket', isProcessReview: true as const }
    }
    return null
  }

  const buttonConfig = shouldShowWorkButton ? getButtonConfig() : null
  const isProcessReview = buttonConfig && 'isProcessReview' in buttonConfig && buttonConfig.isProcessReview
  const firstCardId = hasTickets ? col.cardIds[0] ?? null : null
  const isProcessReviewRunning = halCtx?.processReviewRunningForTicketPk === firstCardId

  const handleProcessReviewButtonClick = async () => {
    if (!hasTickets || !firstCardId) return
    
    // Library mode: HAL owns data; tell HAL to trigger Process Review
    if (halCtx?.onProcessReview) {
      await halCtx.onProcessReview({
        ticketPk: firstCardId,
        ticketId: topTicketId ?? undefined,
      })
      return
    }

    // Iframe/standalone: postMessage to parent
    if (typeof window !== 'undefined' && window.parent !== window) {
      window.parent.postMessage(
        { type: 'HAL_PROCESS_REVIEW', ticketPk: firstCardId, ticketId: topTicketId ?? undefined },
        '*'
      )
    }
  }

  const handleWorkButtonClick = async () => {
    if (!hasTickets || !buttonConfig) return
    const firstCardId = col.cardIds[0] ?? null

    // Process Review uses a different handler
    if (isProcessReview) {
      await handleProcessReviewButtonClick()
      return
    }

    // Library mode: HAL owns data; tell HAL to open chat (HAL will move ticket to Doing for Implement if needed)
    if (halCtx?.onOpenChatAndSend && buttonConfig.chatTarget) {
      halCtx.onOpenChatAndSend({
        chatTarget: buttonConfig.chatTarget as import('./HalKanbanContext').HalChatTarget,
        message: buttonConfig.message,
        ticketPk: firstCardId ?? undefined,
      })
      return
    }

    // Iframe/standalone: For Implementation agent, move ticket to Doing (0084) then postMessage
    if (buttonConfig.chatTarget === 'implementation-agent' && supabaseBoardActive && updateSupabaseTicketKanban && refetchSupabaseTickets && firstCardId) {
      const ticket = supabaseTickets.find((t) => t.pk === firstCardId)
      if (ticket && (ticket.kanban_column_id === 'col-todo' || ticket.kanban_column_id === 'col-unassigned' || !ticket.kanban_column_id)) {
        const targetColumn = supabaseColumns.find((c) => c.id === 'col-doing')
        if (targetColumn) {
          const targetPosition = targetColumn.cardIds.length
          const movedAt = new Date().toISOString()
          const result = await updateSupabaseTicketKanban(firstCardId, {
            kanban_column_id: 'col-doing',
            kanban_position: targetPosition,
            kanban_moved_at: movedAt,
          })
          if (result.ok) {
            setTimeout(() => {
              refetchSupabaseTickets(false).then(() => {
                // Refetch agent runs since ticket moved to Doing (0135)
                if (fetchActiveAgentRuns) {
                  fetchActiveAgentRuns()
                }
              })
            }, 500)
          }
        }
      }
    }

    if (typeof window !== 'undefined' && window.parent !== window && buttonConfig.chatTarget) {
      window.parent.postMessage(
        { type: 'HAL_OPEN_CHAT_AND_SEND', chatTarget: buttonConfig.chatTarget, message: buttonConfig.message },
        '*'
      )
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="column-card"
      data-column-id={col.id}
    >
      <div className="column-header">
        <span className="column-title" {...attributes} {...listeners}>
          {col.title}
        </span>
        <div className="column-header-actions">
          {shouldShowWorkButton && buttonConfig && (
            <button
              type="button"
              className="column-work-button"
              onClick={handleWorkButtonClick}
              disabled={!hasTickets || isProcessReviewRunning}
              aria-label={
                isProcessReviewRunning
                  ? 'Process Review in progress'
                  : hasTickets
                  ? buttonConfig.label
                  : 'No tickets in this column'
              }
              title={
                isProcessReviewRunning
                  ? 'Process Review in progress'
                  : hasTickets
                  ? buttonConfig.label
                  : 'No tickets in this column'
              }
            >
              {isProcessReviewRunning
                ? 'Reviewing...'
                : hasTickets
                ? buttonConfig.label || 'Work top ticket'
                : 'No tickets'}
            </button>
          )}
          {!hideRemove && (
            <button
              type="button"
              className="column-remove"
              onClick={() => onRemove(col.id)}
              aria-label={`Remove column ${col.title}`}
            >
              Remove
            </button>
          )}
        </div>
      </div>
      <div
        ref={setDroppableRef}
        className={`column-cards ${isOver ? 'column-cards-over' : ''}`}
      >
        <SortableContext items={col.cardIds} strategy={verticalListSortingStrategy}>
          {col.cardIds.map((cardId) => {
            const card = cards[cardId]
            if (!card) return null
            const agentRun = agentRunsByTicketPk[cardId] || null
            return (
              <SortableCard
                key={card.id}
                card={card}
                columnId={col.id}
                onOpenDetail={onOpenDetail}
                agentRun={agentRun}
                isSaving={pendingMoves.has(card.id)}
              />
            )
          })}
        </SortableContext>
      </div>
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
  const [supabaseColumnsRows, setSupabaseColumnsRows] = useState<SupabaseKanbanColumnRow[]>([])
  const [supabaseLastRefresh, setSupabaseLastRefresh] = useState<Date | null>(null)
  const [supabaseColumnsLastRefresh, setSupabaseColumnsLastRefresh] = useState<Date | null>(null)
  const [supabaseColumnsLastError, setSupabaseColumnsLastError] = useState<string | null>(null)
  const [supabaseColumnsJustInitialized, setSupabaseColumnsJustInitialized] = useState(false)
  const [_supabaseNotInitialized, setSupabaseNotInitialized] = useState(false)
  const [_selectedSupabaseTicketId, setSelectedSupabaseTicketId] = useState<string | null>(null)
  const [_selectedSupabaseTicketContent, setSelectedSupabaseTicketContent] = useState<string | null>(null)
  // Agent runs for Doing column tickets (0114)
  const [agentRunsByTicketPk, setAgentRunsByTicketPk] = useState<Record<string, SupabaseAgentRunRow>>({})
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
  
  // Ticket attachments (0092)
  const [detailModalAttachments, setDetailModalAttachments] = useState<TicketAttachment[]>([])
  const [detailModalAttachmentsLoading, setDetailModalAttachmentsLoading] = useState(false)
  
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

  /** Agent runs: from HAL when library mode, else from our own fetch */
  const displayAgentRunsByTicketPk = halCtx?.agentRunsByTicketPk ?? agentRunsByTicketPk

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
  const doingTickets = supabaseBoardActive
    ? supabaseTickets.filter((t) => t.kanban_column_id === 'col-doing').sort((a, b) => {
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
          .order('created_at', { ascending: false })
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
  const fetchActiveAgentRuns = useCallback(async () => {
    const url = supabaseProjectUrl.trim()
    const key = supabaseAnonKey.trim()
    if (!url || !key || !connectedRepoFullName) return
    try {
      const client = createClient(url, key)
      // Get all tickets in Doing column
      const doingTickets = supabaseTickets.filter((t) => t.kanban_column_id === 'col-doing')
      if (doingTickets.length === 0) {
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
      setAgentRunsByTicketPk(runsByTicket)
    } catch (e) {
      console.warn('Failed to fetch agent runs:', e)
    }
  }, [supabaseProjectUrl, supabaseAnonKey, connectedRepoFullName, supabaseTickets])

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
        return fetch('/api/artifacts/get', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        })
          .then((r) => r.json().catch(() => ({})))
          .then((j: { artifacts?: SupabaseAgentArtifactRow[] }) => Array.isArray(j.artifacts) ? j.artifacts : [])
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
      } else {
        setDetailModalBody('')
        setDetailModalArtifacts([])
        setDetailModalArtifactsLoading(false)
        setDetailModalArtifactsStatus(null)
        setDetailModalAttachments([])
        setDetailModalAttachmentsLoading(false)
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
        return fetch('/api/artifacts/get', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        })
          .then((r) => r.json().catch(() => ({})))
          .then((j: { artifacts?: SupabaseAgentArtifactRow[] }) => Array.isArray(j.artifacts) ? j.artifacts : [])
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
  }, [])
  const handleRetryTicketDetail = useCallback(() => setDetailModalRetryTrigger((n) => n + 1), [])
  const handleOpenArtifact = useCallback((artifact: SupabaseAgentArtifactRow) => {
    setArtifactViewer(artifact)
  }, [])
  const handleCloseArtifact = useCallback(() => setArtifactViewer(null), [])
  

  // File system mode removed (0065): Supabase-only

  const _handleSupabaseConnect = useCallback(() => {
    connectSupabase(supabaseProjectUrl.trim(), supabaseAnonKey.trim())
  }, [supabaseProjectUrl, supabaseAnonKey, connectSupabase])

  const _handleSelectSupabaseTicket = useCallback((row: SupabaseTicketRow) => {
    setSelectedSupabaseTicketId(row.pk)
    setSelectedSupabaseTicketContent(row.body_md ?? '')
  }, [])

  /** Refetch tickets and columns from Supabase (0020). Uses current url/key. */
  const refetchSupabaseTickets = useCallback(async (skipPendingMoves = false): Promise<boolean> => {
    const url = supabaseProjectUrl.trim()
    const key = supabaseAnonKey.trim()
    if (!url || !key) return false
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
        return false
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
      
      // Don't overwrite tickets that have pending moves (0047)
      // Improved: Preserve optimistic positions to prevent snap-back and jumps (0144)
      // CRITICAL: Always preserve optimistic positions for tickets in pendingMoves,
      // and also preserve positions for other tickets in the same columns to prevent
      // visual jumps when polling refetches happen before backend saves complete.
      if (skipPendingMoves && pendingMoves.size > 0) {
        setSupabaseTickets((prev) => {
          const newMap = new Map(normalizedRows.map((r) => [r.pk, r]))
          // Preserve optimistic updates for pending moves, update others from DB
          const result: SupabaseTicketRow[] = []
          const processedIds = new Set<string>()
          // First, add all existing tickets (preserving pending moves)
          for (const t of prev) {
            if (pendingMoves.has(t.pk)) {
              result.push(t) // Keep optimistic update - never overwrite during pending move
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
          return result
        })
      } else {
        // When not skipping pending moves (refetch after move completes), preserve optimistic positions
        // until backend confirms the move to prevent jumps when backend data arrives (0144)
        setSupabaseTickets((prev) => {
          const newMap = new Map(normalizedRows.map((r) => [r.pk, r]))
          const result: SupabaseTicketRow[] = []
          const processedIds = new Set<string>()
          // For tickets with pending moves, ALWAYS keep optimistic position until backend matches
          // This prevents snap-back when refetch happens before backend save completes
          for (const t of prev) {
            if (pendingMoves.has(t.pk)) {
              const dbRow = newMap.get(t.pk)
              // CRITICAL: Only update if position/column EXACTLY matches optimistic update
              // If backend hasn't updated yet (common case), keep optimistic position
              if (dbRow && 
                  dbRow.kanban_column_id === t.kanban_column_id && 
                  dbRow.kanban_position === t.kanban_position) {
                // Backend matches optimistic update - safe to update with DB data
                // Note: We keep ticket in pendingMoves here - it will be removed by the setTimeout
                // in the drag handler after confirming the position matches
                result.push(dbRow)
              } else {
                // Backend hasn't caught up yet OR there's a discrepancy - KEEP optimistic update
                // This prevents the snap-back behavior where card jumps back to old position
                // Keep ticket in pendingMoves until backend confirms
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
      return true
    } catch {
      return false
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
          const success = await refetchSupabaseTickets(false)
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
                  refetchSupabaseTickets(false).then(() => {
                    // Refetch agent runs since ticket moved from Doing to QA (0135)
                    fetchActiveAgentRuns()
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
    refetchSupabaseTickets(false)
  }, [halCtx, connectedRepoFullName, supabaseBoardActive, refetchSupabaseTickets])

  // Polling when Supabase board is active (0013). Skip when library mode (HAL passes data).
  useEffect(() => {
    if (halCtx || !supabaseBoardActive) return
    const id = setInterval(() => {
      refetchSupabaseTickets(true)
      fetchActiveAgentRuns()
    }, SUPABASE_POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [halCtx, supabaseBoardActive, refetchSupabaseTickets, fetchActiveAgentRuns])

  // Fetch agent runs when tickets change or board becomes active (0114). Skip when library mode (HAL passes agentRunsByTicketPk).
  useEffect(() => {
    if (halCtx || !supabaseBoardActive || !connectedRepoFullName) return
    fetchActiveAgentRuns()
  }, [halCtx, supabaseBoardActive, connectedRepoFullName, supabaseTickets, fetchActiveAgentRuns])

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
      'docs/process/ticket-verification-rules.md',
      'docs/templates/ticket.template.md',
      'docs/templates/pm-review.template.md',
      'docs/templates/agent-task-prompt.template.md',
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
            // Remove from pending after delay - refetch preserves optimistic position until backend matches (0144)
            // CRITICAL: Keep ticket in pendingMoves during refetch to prevent snap-back
            // The refetch logic will preserve the optimistic position if backend hasn't updated yet
            setTimeout(() => {
              refetchSupabaseTickets(false).then(() => {
                // Refetch completed - remove from pendingMoves
                // If backend hasn't updated yet, refetch preserved optimistic position and will try again on next poll
                setPendingMoves((prev) => {
                  const next = new Set(prev)
                  next.delete(ticketPk)
                  return next
                })
                // Refetch agent runs if ticket moved to/from Doing column (0135)
                if (overColumn.id === 'col-doing' || ticket?.kanban_column_id === 'col-doing') {
                  fetchActiveAgentRuns()
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
          refetchSupabaseTickets(false).then(() => {
            // Refetch agent runs if ticket was in Doing column (0135)
            if (ticket?.kanban_column_id === 'col-doing' || overColumn.id === 'col-doing') {
              fetchActiveAgentRuns()
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
            // Remove from pending after delay - refetch preserves optimistic position until backend matches (0144)
            // CRITICAL: Keep ticket in pendingMoves during refetch to prevent snap-back
            // The refetch logic will preserve the optimistic position if backend hasn't updated yet
            setTimeout(() => {
              refetchSupabaseTickets(false).then(() => {
                // Refetch completed - remove from pendingMoves
                // If backend hasn't updated yet, refetch preserved optimistic position and will try again on next poll
                setPendingMoves((prev) => {
                  const next = new Set(prev)
                  next.delete(ticketPk)
                  return next
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
            // Remove from pending after delay - refetch preserves optimistic position until backend matches (0144)
            // CRITICAL: Keep ticket in pendingMoves during refetch to prevent snap-back
            // The refetch logic will preserve the optimistic position if backend hasn't updated yet
            const sourceTicket = supabaseTickets.find((t) => t.pk === ticketPk)
            setTimeout(() => {
              refetchSupabaseTickets(false).then(() => {
                // Refetch completed - remove from pendingMoves
                // If backend hasn't updated yet, refetch preserved optimistic position and will try again on next poll
                setPendingMoves((prev) => {
                  const next = new Set(prev)
                  next.delete(ticketPk)
                  return next
                })
                // Refetch agent runs if ticket moved to/from Doing column (0135)
                if (overColumn.id === 'col-doing' || sourceTicket?.kanban_column_id === 'col-doing') {
                  fetchActiveAgentRuns()
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
            refetchSupabaseTickets(false).then(() => {
              // Refetch agent runs if ticket was in Doing column (0135)
              if (sourceTicket?.kanban_column_id === 'col-doing' || overColumn.id === 'col-doing') {
                fetchActiveAgentRuns()
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
                    console.warn(`Failed to create QA artifact for ticket ${ticketNumber}:`, qaResult.error)
                    addLog(`Warning: Failed to create QA artifact: ${qaResult.error}`)
                    // Continue with ticket update even if artifact creation fails
                  } else {
                    addLog(`QA artifact created/updated for ticket ${displayId} with FAIL verdict`)
                    // Refresh artifacts to show the new QA artifact
                    if (refreshDetailModalArtifacts) {
                      setTimeout(() => {
                        refreshDetailModalArtifacts()
                      }, 500)
                    }
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
      />

      {/* Active work row: shows tickets in Doing column (0145) - positioned above DndContext */}
      {supabaseBoardActive && doingTickets.length > 0 && (
        <section className="active-work-row" aria-label="Active work">
          <h2 className="active-work-title">Active work</h2>
          <div className="active-work-items">
            {doingTickets.map((ticket) => {
              const agentRun = displayAgentRunsByTicketPk[ticket.pk]
              const agentName = agentRun?.agent_type === 'implementation' ? 'Implementation' : agentRun?.agent_type === 'qa' ? 'QA' : null
              const agentStatus = agentRun?.status || null
              // Determine status dot color: green for active (launching, polling), red for failed, gray for finished/created/no run
              const statusDotColor = agentStatus === 'launching' || agentStatus === 'polling' 
                ? 'green' 
                : agentStatus === 'failed' 
                ? 'red' 
                : 'gray'
              // Status label for tooltip
              const statusLabel = agentStatus 
                ? agentStatus.charAt(0).toUpperCase() + agentStatus.slice(1)
                : agentName 
                ? 'Doing' 
                : 'Unassigned'
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
                      <span 
                        className={`active-work-item-status-dot status-dot-${statusDotColor}`}
                        title={statusLabel}
                        aria-label={`Status: ${statusLabel}`}
                      />
                      {timestamp && (
                        <span className="active-work-item-timestamp" title={`Updated ${timestamp}`}>
                          {timestamp}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
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
                  agentRunsByTicketPk={displayAgentRunsByTicketPk}
                  pendingMoves={pendingMoves}
                  fetchActiveAgentRuns={fetchActiveAgentRuns}
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
