import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
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

type LogEntry = { id: number; message: string; at: string }
type Card = { id: string; title: string }
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

const SUPABASE_CONFIG_KEY = 'supabase-ticketstore-config'
const CONNECTED_REPO_KEY = 'hal-connected-repo'
/** Polling interval when Supabase board is active (0013); 10s */
const SUPABASE_POLL_INTERVAL_MS = 10_000
/** Delay before refetch after a move so DB write is visible; avoids stale read overwriting last moves */
const REFETCH_AFTER_MOVE_MS = 1500
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
  { id: 'col-qa', title: 'QA', position: 3 },
  { id: 'col-human-in-the-loop', title: 'Human in the Loop', position: 4 },
  { id: 'col-done', title: 'Done', position: 5 },
  { id: 'col-wont-implement', title: 'Will Not Implement', position: 6 },
] as const

/** First 4 digits from filename (e.g. 0009-...md → 0009). Invalid → null. */
function extractTicketId(filename: string): string | null {
  const match = filename.match(/^(\d{4})/)
  return match ? match[1] : null
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
  { id: 'col-qa', title: 'QA', cardIds: [] },
  { id: 'col-human-in-the-loop', title: 'Human in the Loop', cardIds: [] },
  { id: 'col-done', title: 'Done', cardIds: ['c-7', 'c-8', 'c-9'] },
  { id: 'col-wont-implement', title: 'Will Not Implement', cardIds: [] },
]

/** Unassigned, To-do, Doing, QA, Human in the Loop, Done, Will Not Implement; tickets with null or col-unassigned go in Unassigned */
const KANBAN_COLUMN_IDS = [
  'col-unassigned',
  'col-todo',
  'col-doing',
  'col-qa',
  'col-human-in-the-loop',
  'col-done',
  'col-wont-implement',
] as const

/** Filter raw DB columns to canonical 7, in order; create fallbacks for missing. Use in connectSupabase and refetchSupabaseTickets. */
function canonicalizeColumnRows(
  rows: SupabaseKanbanColumnRow[]
): SupabaseKanbanColumnRow[] {
  const canonicalOrder = KANBAN_COLUMN_IDS as unknown as string[]
  const filtered = rows.filter((c) => canonicalOrder.includes(c.id))
  return canonicalOrder.map((id, i) => {
    const row = filtered.find((c) => c.id === id)
    return (
      row ?? {
        id,
        title: id.replace('col-', '').replace(/-/g, ' '),
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
  { id: 'col-qa', title: 'QA', cardIds: [] },
  { id: 'col-human-in-the-loop', title: 'Human in the Loop', cardIds: [] },
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

const HAL_API_BASE = (import.meta.env.VITE_HAL_API_URL as string) || 'http://localhost:5173'

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
}: {
  open: boolean
  onClose: () => void
  ticketId: string
  title: string
  body: string | null
  loading: boolean
  error: string | null
  onRetry?: () => void
}) {
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

  if (!open) return null

  const { frontmatter, body: bodyOnly } = body ? parseFrontmatter(body) : { frontmatter: {}, body: '' }
  const priority = body ? extractPriority(frontmatter, body) : null
  const markdownBody = body ? bodyOnly : ''

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
            <div className="ticket-detail-body">
              {markdownBody ? (
                <ReactMarkdown>{markdownBody}</ReactMarkdown>
              ) : (
                <p className="ticket-detail-empty">No content.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SortableCard({
  card,
  columnId,
  onDelete,
  showDelete = false,
  onOpenDetail,
}: {
  card: Card
  columnId: string
  onDelete?: (cardId: string) => void
  showDelete?: boolean
  onOpenDetail?: (cardId: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: 'card', columnId },
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (onDelete) onDelete(card.id)
  }
  const handleDeletePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation()
  }
  const handleCardClick = () => {
    if (onOpenDetail) onOpenDetail(card.id)
  }
  return (
    <div ref={setNodeRef} style={style} className="ticket-card" data-card-id={card.id}>
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
      >
        <span className="ticket-card-title">{card.title}</span>
      </button>
      {showDelete && onDelete && (
        <button
          type="button"
          className="ticket-card-delete"
          onClick={handleDeleteClick}
          onPointerDown={handleDeletePointerDown}
          aria-label={`Delete ticket ${card.id}`}
          title="Delete"
        >
          Delete
        </button>
      )}
    </div>
  )
}

function SortableColumn({
  col,
  cards,
  onRemove,
  hideRemove = false,
  onDeleteTicket,
  showDelete = false,
  onOpenDetail,
}: {
  col: Column
  cards: Record<string, Card>
  onRemove: (id: string) => void
  hideRemove?: boolean
  onDeleteTicket?: (cardId: string) => void
  showDelete?: boolean
  onOpenDetail?: (cardId: string) => void
}) {
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

  // Get top ticket ID from column
  const topTicketId = col.cardIds.length > 0 ? extractTicketId(col.cardIds[0]) : null
  const hasTickets = col.cardIds.length > 0 && topTicketId != null

  // Determine if this column should show a work button
  const shouldShowWorkButton = col.id === 'col-unassigned' || col.id === 'col-todo' || col.id === 'col-qa'
  
  // Get button label and chat target based on column
  const getButtonConfig = () => {
    if (col.id === 'col-unassigned') {
      return { label: 'Prepare top ticket', chatTarget: 'project-manager', message: `Please prepare ticket ${topTicketId} and get it ready (Definition of Ready).` }
    } else if (col.id === 'col-todo') {
      return { label: 'Implement top ticket', chatTarget: 'implementation-agent', message: `Implement ticket ${topTicketId}.` }
    } else if (col.id === 'col-qa') {
      return { label: 'QA top ticket', chatTarget: 'qa-agent', message: `QA ticket ${topTicketId}.` }
    }
    return null
  }

  const buttonConfig = shouldShowWorkButton ? getButtonConfig() : null

  const handleWorkButtonClick = () => {
    if (!hasTickets || !buttonConfig) return
    
    // Send postMessage to parent window to open chat and send message
    if (typeof window !== 'undefined' && window.parent !== window) {
      window.parent.postMessage(
        {
          type: 'HAL_OPEN_CHAT_AND_SEND',
          chatTarget: buttonConfig.chatTarget,
          message: buttonConfig.message,
        },
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
              disabled={!hasTickets}
              aria-label={hasTickets ? buttonConfig.label : 'No tickets in this column'}
              title={hasTickets ? buttonConfig.label : 'No tickets in this column'}
            >
              {hasTickets ? (buttonConfig.label || 'Work top ticket') : 'No tickets'}
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
            return (
              <SortableCard
                key={card.id}
                card={card}
                columnId={col.id}
                onDelete={onDeleteTicket}
                showDelete={showDelete}
                onOpenDetail={onOpenDetail}
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

  // Project folder and connection state
  const [projectFolderHandle, setProjectFolderHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [projectName, setProjectName] = useState<string | null>(null)
  const [connectError, setConnectError] = useState<string | null>(null)
  
  // Detect if we're embedded in an iframe (HAL)
  const isEmbedded = typeof window !== 'undefined' && window.self !== window.top

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
  const [connectedRepoFullName, setConnectedRepoFullName] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CONNECTED_REPO_KEY)
    } catch {
      return null
    }
  })
  const [supabaseConnectionStatus, setSupabaseConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected')
  const [supabaseLastError, setSupabaseLastError] = useState<string | null>(null)

  // Restore Supabase url/key from localStorage on mount so key is in state before any refetch (iframe refresh or late HAL message)
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
        connectSupabase(url, key)
      }
    } catch {
      // ignore
    }
  }, [])
  const [supabaseTickets, setSupabaseTickets] = useState<SupabaseTicketRow[]>([])
  const [supabaseColumnsRows, setSupabaseColumnsRows] = useState<SupabaseKanbanColumnRow[]>([])
  const [supabaseLastRefresh, setSupabaseLastRefresh] = useState<Date | null>(null)
  const [supabaseColumnsLastRefresh, setSupabaseColumnsLastRefresh] = useState<Date | null>(null)
  const [supabaseColumnsLastError, setSupabaseColumnsLastError] = useState<string | null>(null)
  const [supabaseColumnsJustInitialized, setSupabaseColumnsJustInitialized] = useState(false)
  const [_supabaseNotInitialized, setSupabaseNotInitialized] = useState(false)
  const [_selectedSupabaseTicketId, setSelectedSupabaseTicketId] = useState<string | null>(null)
  const [_selectedSupabaseTicketContent, setSelectedSupabaseTicketContent] = useState<string | null>(null)
  // Sync with Docs removed (Supabase-only) (0065)
  const [supabaseLastDeleteError, setSupabaseLastDeleteError] = useState<string | null>(null)
  const [deleteSuccessMessage, setDeleteSuccessMessage] = useState<string | null>(null)
  // Ticket persistence tracking (0047)
  const [lastMovePersisted, setLastMovePersisted] = useState<{ success: boolean; timestamp: Date; ticketId: string; error?: string } | null>(null)
  const [pendingMoves, setPendingMoves] = useState<Set<string>>(new Set())

  // Ticket detail modal (0033): click card opens modal; content from Supabase or docs
  const [detailModal, setDetailModal] = useState<{ ticketId: string; title: string } | null>(null)
  const [detailModalBody, setDetailModalBody] = useState<string | null>(null)
  const [detailModalError, setDetailModalError] = useState<string | null>(null)
  const [detailModalLoading, setDetailModalLoading] = useState(false)
  const [detailModalRetryTrigger, setDetailModalRetryTrigger] = useState(0)

  // Supabase board: when connected, board is driven by supabaseTickets + supabaseColumnsRows (0020)
  const supabaseBoardActive = supabaseConnectionStatus === 'connected'
  const { columns: supabaseColumns, unknownColumnTicketIds: supabaseUnknownColumnTicketIds } = useMemo(() => {
    if (!supabaseBoardActive || supabaseColumnsRows.length === 0) {
      return { columns: EMPTY_KANBAN_COLUMNS, unknownColumnTicketIds: [] as string[] }
    }
    const columnIds = new Set(supabaseColumnsRows.map((c) => c.id))
    const firstColumnId = supabaseColumnsRows[0].id
    const byColumn: Record<string, { id: string; position: number }[]> = {}
    for (const c of supabaseColumnsRows) {
      byColumn[c.id] = []
    }
    const unknownIds: string[] = []
    for (const t of supabaseTickets) {
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
    const columns: Column[] = supabaseColumnsRows.map((c) => ({
      id: c.id,
      title: c.title,
      cardIds: byColumn[c.id]?.map((x) => x.id) ?? [],
    }))
    return { columns, unknownColumnTicketIds: unknownIds }
  }, [supabaseBoardActive, supabaseColumnsRows, supabaseTickets])
  const supabaseCards = useMemo(() => {
    const map: Record<string, Card> = {}
    for (const t of supabaseTickets) {
      const cleanTitle = t.title.replace(/^(?:[A-Za-z0-9]{2,10}-)?\d{4}\s*[—–-]\s*/, '')
      const display = t.display_id ? `${t.display_id} — ${cleanTitle}` : t.title
      map[t.pk] = { id: t.pk, title: display }
    }
    return map
  }, [supabaseTickets])

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
        const r = await client
          .from('tickets')
          .select('pk, id, repo_full_name, ticket_number, display_id, filename, title, body_md, kanban_column_id, kanban_position, kanban_moved_at, updated_at')
          .order('ticket_number', { ascending: true })
        rows = (r.data ?? null) as unknown[] | null
        error = (r.error as typeof error) ?? null
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
        // Migration: add missing columns for existing DBs (col-qa, col-human-in-the-loop, col-wont-implement)
        const ids = new Set(finalColRows.map((c) => c.id))
        const toInsert: { id: string; title: string; position: number }[] = []
        if (!ids.has('col-qa')) {
          toInsert.push({ id: 'col-qa', title: 'QA', position: -1 })
        }
        if (!ids.has('col-human-in-the-loop')) {
          toInsert.push({ id: 'col-human-in-the-loop', title: 'Human in the Loop', position: -1 })
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
      const folderHandle = await window.showDirectoryPicker({ id: 'kanban-project-folder', mode: 'read' })
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

  // Listen for postMessage from HAL parent (when embedded in iframe)
  useEffect(() => {
    if (!isEmbedded) return
    
    const handleMessage = (event: MessageEvent) => {
      // Only accept messages from parent origin
      if (event.source !== window.parent) return
      
      const data = event.data as { type?: string; url?: string; key?: string; theme?: string; repoFullName?: string }
      
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
      }
    }
    
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [isEmbedded, connectSupabase])

  // Supabase-only mode (0065): always use Supabase when connected, otherwise empty
  const columnsForDisplay = supabaseBoardActive ? supabaseColumns : columns
  const cardsForDisplay = supabaseBoardActive ? supabaseCards : cards

  // Resolve ticket detail modal content when modal opens (0033); Supabase-only (0065)
  useEffect(() => {
    if (!detailModal) {
      setDetailModalBody(null)
      setDetailModalError(null)
      setDetailModalLoading(false)
      return
    }
    const { ticketId } = detailModal
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
      } else {
        setDetailModalBody('')
      }
      setDetailModalError(null)
      setDetailModalLoading(false)
    } else {
      // Supabase not connected: show error
      setDetailModalError('Supabase not connected. Connect project folder to view ticket details.')
      setDetailModalBody(null)
      setDetailModalLoading(false)
    }
  }, [detailModal, supabaseBoardActive, supabaseTickets, supabaseProjectUrl, supabaseAnonKey, detailModalRetryTrigger, addLog])

  const handleOpenTicketDetail = useCallback(
    (cardId: string) => {
      const card = cardsForDisplay[cardId]
      if (card) setDetailModal({ ticketId: cardId, title: card.title })
    },
    [cardsForDisplay]
  )
  const handleCloseTicketDetail = useCallback(() => setDetailModal(null), [])
  const handleRetryTicketDetail = useCallback(() => setDetailModalRetryTrigger((n) => n + 1), [])

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
        const r = await client
          .from('tickets')
          .select('pk, id, repo_full_name, ticket_number, display_id, filename, title, body_md, kanban_column_id, kanban_position, kanban_moved_at, updated_at')
          .order('ticket_number', { ascending: true })
        rows = (r.data ?? null) as unknown[] | null
        error = (r.error as typeof error) ?? null
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
      if (skipPendingMoves && pendingMoves.size > 0) {
        setSupabaseTickets((prev) => {
          const newMap = new Map(normalizedRows.map((r) => [r.pk, r]))
          // Preserve optimistic updates for pending moves, update others from DB
          const result: SupabaseTicketRow[] = []
          const processedIds = new Set<string>()
          // First, add all existing tickets (preserving pending moves)
          for (const t of prev) {
            if (pendingMoves.has(t.pk)) {
              result.push(t) // Keep optimistic update
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
        setSupabaseTickets(normalizedRows)
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

  /** Delete a ticket from Supabase (Supabase-only mode, 0065). */
  const handleDeleteTicket = useCallback(
    async (ticketPk: string) => {
      const url = supabaseProjectUrl.trim()
      const key = supabaseAnonKey.trim()
      if (!url || !key) {
        setSupabaseLastDeleteError('Supabase not configured. Connect first.')
        setTimeout(() => setSupabaseLastDeleteError(null), 5000)
        return
      }
      const card = supabaseCards[ticketPk]
      const label = card ? `"${card.title}"` : ticketPk
      if (!window.confirm(`Delete ticket ${label}? This cannot be undone.`)) return

      setSupabaseLastDeleteError(null)
      setDeleteSuccessMessage(null)
      try {
        const res = await fetch(`${HAL_API_BASE}/api/tickets/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticketPk, supabaseUrl: url, supabaseAnonKey: key }),
        })
        const data = (await res.json()) as { success?: boolean; error?: string }
        if (data.success) {
          // Optimistically remove from state so the board updates immediately
          setSupabaseTickets((prev) => prev.filter((t) => t.pk !== ticketPk))
          setDeleteSuccessMessage(`Deleted ticket ${label}`)
          setTimeout(() => setDeleteSuccessMessage(null), 5000)
          // Refetch to confirm server-side delete is reflected
          await refetchSupabaseTickets()
          addLog(`Deleted ticket ${label}`)
          if (typeof window !== 'undefined' && window.parent !== window) {
            window.parent.postMessage({ type: 'HAL_SYNC_COMPLETED' }, '*')
          }
        } else {
          const err = data.error ?? `HTTP ${res.status}`
          setSupabaseLastDeleteError(err)
          setTimeout(() => setSupabaseLastDeleteError(null), 10000)
          addLog(`Delete failed: ${err}`)
        }
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e)
        setSupabaseLastDeleteError(err)
        setTimeout(() => setSupabaseLastDeleteError(null), 10000)
        addLog(`Delete failed: ${err}`)
      }
    },
    [supabaseProjectUrl, supabaseAnonKey, supabaseCards, refetchSupabaseTickets, addLog]
  )

  // When connected repo changes or we connect to Supabase with a repo already set, refetch tickets (0079).
  useEffect(() => {
    if (!supabaseBoardActive || !supabaseProjectUrl?.trim() || !supabaseAnonKey?.trim()) return
    refetchSupabaseTickets(false)
  }, [connectedRepoFullName, supabaseBoardActive, refetchSupabaseTickets])

  // Polling when Supabase board is active (0013); skip pending moves to avoid overwriting optimistic updates (0047)
  useEffect(() => {
    if (!supabaseBoardActive) return
    const id = setInterval(() => refetchSupabaseTickets(true), SUPABASE_POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [supabaseBoardActive, refetchSupabaseTickets])

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

      // File system mode removed (0065): Supabase-only

      // Supabase: drag from ticket list into column (0013)
      if (
        !sourceColumn &&
        supabaseBoardActive &&
        overColumn &&
        supabaseTickets.some((t) => t.pk === String(active.id))
      ) {
        const ticketPk = String(active.id)
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
          // Remove from pending after delay to allow DB write to be visible
          setTimeout(() => {
            setPendingMoves((prev) => {
              const next = new Set(prev)
              next.delete(ticketPk)
              return next
            })
            refetchSupabaseTickets(false) // Full refetch after move is persisted
          }, REFETCH_AFTER_MOVE_MS)
        } else {
          // Revert optimistic update on failure (0047)
          setLastMovePersisted({ success: false, timestamp: new Date(), ticketId: ticketPk, error: result.error })
          setPendingMoves((prev) => {
            const next = new Set(prev)
            next.delete(ticketPk)
            return next
          })
          refetchSupabaseTickets(false) // Full refetch to restore correct state
          addLog(`Supabase update failed: ${result.error}`)
        }
        return
      }

      if (!sourceColumn || !overColumn) return

      // Supabase: move or reorder within/between columns (0013)
      if (supabaseBoardActive) {
        const sourceCardIds = sourceColumn.cardIds
        const activeIndex = sourceCardIds.indexOf(String(active.id))
        const isSameColumn = sourceColumn.id === overColumn.id
        let overIndex = overColumn.cardIds.indexOf(String(effectiveOverId))
        if (overIndex < 0) overIndex = overColumn.cardIds.length

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
            setTimeout(() => {
              setPendingMoves((prev) => {
                const next = new Set(prev)
                next.delete(ticketPk)
                return next
              })
              refetchSupabaseTickets(false) // Full refetch after move is persisted
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
            setTimeout(() => {
              setPendingMoves((prev) => {
                const next = new Set(prev)
                next.delete(ticketPk)
                return next
              })
              refetchSupabaseTickets(false) // Full refetch after move is persisted
            }, REFETCH_AFTER_MOVE_MS)
          } else {
            // Revert optimistic update on failure (0047)
            setLastMovePersisted({ success: false, timestamp: new Date(), ticketId: ticketPk, error: result.error })
            setPendingMoves((prev) => {
              const next = new Set(prev)
              next.delete(ticketPk)
              return next
            })
            refetchSupabaseTickets(false) // Full refetch to restore correct state
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
    _DraggableSupabaseTicketItem,
    _supabaseNotInitialized,
    _selectedSupabaseTicketId,
    _selectedSupabaseTicketContent,
    _handleSupabaseConnect,
    _handleSelectSupabaseTicket,
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

      {supabaseLastDeleteError && (
        <div className="config-missing-error" role="alert">
          Delete failed: {supabaseLastDeleteError}
        </div>
      )}

      {deleteSuccessMessage && (
        <div className="success-message" role="status">
          ✓ {deleteSuccessMessage}
        </div>
      )}

      {/* Ticket persistence status indicator (0047) */}
      {supabaseBoardActive && lastMovePersisted && (
        <div
          className={lastMovePersisted.success ? 'success-message' : 'config-missing-error'}
          role={lastMovePersisted.success ? 'status' : 'alert'}
        >
          {lastMovePersisted.success ? (
            <>✓ Move persisted: ticket {lastMovePersisted.ticketId} at {lastMovePersisted.timestamp.toLocaleTimeString()}</>
          ) : (
            <>✗ Move failed: ticket {lastMovePersisted.ticketId} - {lastMovePersisted.error ?? 'Unknown error'}</>
          )}
        </div>
      )}
      {/* Auto-dismiss success messages after 5 seconds (0047) */}
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
        />
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
                  onDeleteTicket={handleDeleteTicket}
                  showDelete={supabaseBoardActive}
                  onOpenDetail={handleOpenTicketDetail}
                />
              ))}
            </div>
          </SortableContext>
        </section>

        <DragOverlay>
          {activeCardId && cardsForDisplay[String(activeCardId)] ? (
            <div className="ticket-card" data-card-id={activeCardId}>
              <span className="ticket-card-drag-handle" aria-hidden />
              <span className="ticket-card-title">{cardsForDisplay[String(activeCardId)].title}</span>
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
              <p>Last delete error: {supabaseLastDeleteError ?? 'none'}</p>
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
