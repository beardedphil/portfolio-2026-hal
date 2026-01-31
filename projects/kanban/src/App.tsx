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
  getKanbanFromFrontmatter,
  updateKanbanInContent,
  type KanbanFrontmatter,
} from './frontmatter'
import { createClient } from '@supabase/supabase-js'
import ReactMarkdown from 'react-markdown'

type LogEntry = { id: number; message: string; at: string }
type Card = { id: string; title: string }
type Column = { id: string; title: string; cardIds: string[] }

type TicketFile = { name: string; path: string }

/** Supabase tickets table row (read-only v0) */
type SupabaseTicketRow = {
  id: string
  filename: string
  title: string
  body_md: string
  kanban_column_id: string | null
  kanban_position: number | null
  kanban_moved_at: string | null
  updated_at: string
}

/** Supabase kanban_columns table row (0020) */
type SupabaseKanbanColumnRow = {
  id: string
  title: string
  position: number
  created_at: string
  updated_at: string
}

/** Parsed ticket from docs/tickets/*.md for import */
type ParsedDocTicket = {
  id: string
  filename: string
  title: string
  body_md: string
  kanban_column_id: string | null
  kanban_position: number | null
  kanban_moved_at: string | null
}

/** Single file result from scan: either parsed or fail */
type DocFileResult =
  | { ok: true; data: ParsedDocTicket }
  | { ok: false; filename: string; reason: string }

/** Planned action for one file in import */
type ImportPlanItem = {
  filename: string
  id: string
  action: 'create' | 'update' | 'skip' | 'fail'
  reason?: string
}

/** Preview result: totals + per-file list */
type ImportPreviewResult = {
  found: number
  create: number
  update: number
  skip: number
  fail: number
  items: ImportPlanItem[]
}

/** Sync preview: docs→DB plan + DB→docs (rows to write to docs) */
type SyncPreviewResult = {
  docsToDb: ImportPreviewResult
  dbToDocs: { id: string; filename: string }[]
}

const SUPABASE_CONFIG_KEY = 'supabase-ticketstore-config'
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

/** Best-effort title: "- **Title**: ..." in content, else filename without .md */
function extractTitleFromContent(content: string, filename: string): string {
  const m = content.match(/\*\*Title\*\*:\s*(.+?)(?:\n|$)/)
  if (m) return m[1].trim()
  return filename.replace(/\.md$/i, '')
}

/** Scan docs/tickets from project root; return parsed or fail per file. */
async function scanDocsTickets(root: FileSystemDirectoryHandle): Promise<DocFileResult[]> {
  const results: DocFileResult[] = []
  const docs = await root.getDirectoryHandle('docs')
  const tickets = await docs.getDirectoryHandle('tickets')
  const files: { name: string }[] = []
  for await (const [name, entry] of tickets.entries()) {
    if (entry.kind === 'file' && name.endsWith('.md')) files.push({ name })
  }
  files.sort((a, b) => a.name.localeCompare(b.name))
  for (const { name } of files) {
    const id = extractTicketId(name)
    if (!id) {
      results.push({ ok: false, filename: name, reason: 'Filename must start with 4 digits (e.g. 0009-...)' })
      continue
    }
    try {
      const fileHandle = await tickets.getFileHandle(name)
      const file = await fileHandle.getFile()
      const body_md = await file.text()
      const title = extractTitleFromContent(body_md, name)
      const { frontmatter } = parseFrontmatter(body_md)
      const kanban = getKanbanFromFrontmatter(frontmatter)
      results.push({
        ok: true,
        data: {
          id,
          filename: name,
          title,
          body_md,
          kanban_column_id: kanban.kanbanColumnId ?? null,
          kanban_position: kanban.kanbanPosition ?? null,
          kanban_moved_at: kanban.kanbanMovedAt ?? null,
        },
      })
    } catch (e) {
      results.push({
        ok: false,
        filename: name,
        reason: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return results
}

/** Build import plan from scan results and existing Supabase rows. */
function buildImportPlan(
  scanResults: DocFileResult[],
  existingRows: SupabaseTicketRow[]
): ImportPreviewResult {
  const byId = new Map(existingRows.map((r) => [r.id, r]))
  const items: ImportPlanItem[] = []
  let create = 0,
    update = 0,
    skip = 0,
    fail = 0
  for (const r of scanResults) {
    if (!r.ok) {
      items.push({ filename: r.filename, id: '', action: 'fail', reason: r.reason })
      fail++
      continue
    }
    const d = r.data
    const existing = byId.get(d.id)
    if (!existing) {
      items.push({ filename: d.filename, id: d.id, action: 'create' })
      create++
    } else if (existing.body_md !== d.body_md) {
      items.push({ filename: d.filename, id: d.id, action: 'update' })
      update++
    } else {
      items.push({ filename: d.filename, id: d.id, action: 'skip', reason: 'Unchanged' })
      skip++
    }
  }
  return {
    found: scanResults.length,
    create,
    update,
    skip,
    fail,
    items,
  }
}

/** Build sync preview: docs→DB plan + DB rows to write to docs (id not in doc ids). */
function buildSyncPreview(
  scanResults: DocFileResult[],
  existingRows: SupabaseTicketRow[]
): SyncPreviewResult {
  const docIds = new Set<string>()
  for (const r of scanResults) {
    if (r.ok) docIds.add(r.data.id)
  }
  const docsToDb = buildImportPlan(scanResults, existingRows)
  const dbToDocs = existingRows.filter((r) => !docIds.has(r.id)).map((r) => ({ id: r.id, filename: r.filename }))
  return { docsToDb, dbToDocs }
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

function _DraggableTicketItem({
  path,
  name,
  onClick,
  isSelected,
}: {
  path: string
  name: string
  onClick: () => void
  isSelected: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: path,
    data: { type: 'ticket-from-list', path },
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  }
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
        {name}
      </button>
    </li>
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
    id: row.id,
    data: { type: 'supabase-ticket-from-list', id: row.id },
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  }
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
        {row.title} ({row.id})
      </button>
    </li>
  )
}

function App() {
  const [debugOpen, setDebugOpen] = useState(false)
  const [actionLog, setActionLog] = useState<LogEntry[]>([])
  const [runtimeError, _setRuntimeError] = useState<string | null>(null)
  const [columns, setColumns] = useState<Column[]>(() => EMPTY_KANBAN_COLUMNS)
  const [cards] = useState<Record<string, Card>>({})
  const [showAddColumnForm, setShowAddColumnForm] = useState(false)
  const [newColumnTitle, setNewColumnTitle] = useState('')
  const [addColumnError, setAddColumnError] = useState<string | null>(null)
  const [activeCardId, setActiveCardId] = useState<UniqueIdentifier | null>(null)
  const lastOverId = useRef<UniqueIdentifier | null>(null)

  // Ticket Store (Docs read + write when connected with readwrite)
  const [ticketStoreConnected, setTicketStoreConnected] = useState(false)
  const [ticketStoreRootHandle, setTicketStoreRootHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [ticketStoreFiles, setTicketStoreFiles] = useState<TicketFile[]>([])
  const [ticketStoreLastRefresh, setTicketStoreLastRefresh] = useState<Date | null>(null)
  const [ticketStoreLastError, setTicketStoreLastError] = useState<string | null>(null)
  const [ticketStoreConnectMessage, setTicketStoreConnectMessage] = useState<string | null>(null)
  const [selectedTicketPath, setSelectedTicketPath] = useState<string | null>(null)
  const [selectedTicketContent, setSelectedTicketContent] = useState<string | null>(null)
  const [_ticketViewerLoading, setTicketViewerLoading] = useState(false)
  // Kanban-from-docs state (used when connected)
  const [ticketColumns, setTicketColumns] = useState<Column[]>(() => EMPTY_KANBAN_COLUMNS)
  const [ticketCards, setTicketCards] = useState<Record<string, Card>>({})
  const [lastSavedTicketPath, setLastSavedTicketPath] = useState<string | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [lastWriteError, setLastWriteError] = useState<string | null>(null)

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
  const [supabaseConnectionStatus, setSupabaseConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected')
  const [supabaseLastError, setSupabaseLastError] = useState<string | null>(null)
  const [supabaseTickets, setSupabaseTickets] = useState<SupabaseTicketRow[]>([])
  const [supabaseColumnsRows, setSupabaseColumnsRows] = useState<SupabaseKanbanColumnRow[]>([])
  const [supabaseLastRefresh, setSupabaseLastRefresh] = useState<Date | null>(null)
  const [supabaseColumnsLastRefresh, setSupabaseColumnsLastRefresh] = useState<Date | null>(null)
  const [supabaseColumnsLastError, setSupabaseColumnsLastError] = useState<string | null>(null)
  const [supabaseColumnsJustInitialized, setSupabaseColumnsJustInitialized] = useState(false)
  const [_supabaseNotInitialized, setSupabaseNotInitialized] = useState(false)
  const [_selectedSupabaseTicketId, setSelectedSupabaseTicketId] = useState<string | null>(null)
  const [_selectedSupabaseTicketContent, setSelectedSupabaseTicketContent] = useState<string | null>(null)
  // Sync with Docs (docs↔DB; replaces one-way Import)
  const [_syncPreview, setSyncPreview] = useState<SyncPreviewResult | null>(null)
  const [_syncInProgress, setSyncInProgress] = useState(false)
  const [_syncSummary, setSyncSummary] = useState<string | null>(null)
  const [_syncProgressText, setSyncProgressText] = useState<string | null>(null)
  const [supabaseLastSyncError, setSupabaseLastSyncError] = useState<string | null>(null)
  const [supabaseLastDeleteError, setSupabaseLastDeleteError] = useState<string | null>(null)

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
            : (unknownIds.push(t.id), firstColumnId)
      const pos = typeof t.kanban_position === 'number' ? t.kanban_position : 0
      byColumn[colId].push({ id: t.id, position: pos })
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
      map[t.id] = { id: t.id, title: t.title }
    }
    return map
  }, [supabaseTickets])

  /** Connect to Supabase with given url/key; sets status, tickets, errors. */
  const connectSupabase = useCallback(async (url: string, key: string) => {
    setSupabaseLastError(null)
    setSupabaseNotInitialized(false)
    if (!url || !key) {
      setSupabaseLastError('Project URL and Anon key are required.')
      return
    }
    setSupabaseConnectionStatus('connecting')
    try {
      const client = createClient(url, key)
      const { error: testError } = await client.from('tickets').select('id').limit(1)
      if (testError) {
        const code = (testError as { code?: string }).code
        const msg = testError.message ?? String(testError)
        const lower = msg.toLowerCase()
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
      const { data: rows, error } = await client
        .from('tickets')
        .select('id, filename, title, body_md, kanban_column_id, kanban_position, kanban_moved_at, updated_at')
        .order('id')
      if (error) {
        setSupabaseLastError(error.message ?? String(error))
        setSupabaseConnectionStatus('disconnected')
        setSupabaseTickets([])
        setSupabaseColumnsRows([])
        return
      }
      setSupabaseTickets((rows ?? []) as SupabaseTicketRow[])

      // Fetch kanban_columns (0020); init defaults if empty
      setSupabaseColumnsLastError(null)
      const { data: colRows, error: colError } = await client
        .from('kanban_columns')
        .select('id, title, position, created_at, updated_at')
        .order('position', { ascending: true })
      if (colError) {
        const code = (colError as { code?: string }).code
        const msg = colError.message ?? String(colError)
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
      
      const data = event.data as { type?: string; url?: string; key?: string }
      
      if (data.type === 'HAL_CONNECT_SUPABASE' && data.url && data.key) {
        setProjectName('HAL-connected')
        connectSupabase(data.url, data.key)
      } else if (data.type === 'HAL_DISCONNECT') {
        setProjectName(null)
        setSupabaseConnectionStatus('disconnected')
        setSupabaseTickets([])
        setSupabaseColumnsRows([])
      }
    }
    
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [isEmbedded, connectSupabase])

  const columnsForDisplay = supabaseBoardActive
    ? supabaseColumns
    : ticketStoreConnected
      ? ticketColumns
      : columns
  const cardsForDisplay = supabaseBoardActive
    ? supabaseCards
    : ticketStoreConnected
      ? ticketCards
      : cards

  // Resolve ticket detail modal content when modal opens (0033)
  useEffect(() => {
    if (!detailModal) {
      setDetailModalBody(null)
      setDetailModalError(null)
      setDetailModalLoading(false)
      return
    }
    const { ticketId } = detailModal
    if (supabaseBoardActive) {
      const row = supabaseTickets.find((t) => t.id === ticketId)
      setDetailModalBody(row?.body_md ?? '')
      setDetailModalError(null)
      setDetailModalLoading(false)
      return
    }
    if (ticketStoreConnected && ticketStoreRootHandle && (ticketId.startsWith('docs/') || ticketId.includes('tickets'))) {
      setDetailModalLoading(true)
      setDetailModalError(null)
      const filename = ticketId.split('/').pop() ?? ticketId
      ;(async () => {
        try {
          const docs = await ticketStoreRootHandle.getDirectoryHandle('docs')
          const tickets = await docs.getDirectoryHandle('tickets')
          const fileHandle = await tickets.getFileHandle(filename)
          const file = await fileHandle.getFile()
          const text = await file.text()
          setDetailModalBody(text)
          setDetailModalError(null)
        } catch (e) {
          setDetailModalError(e instanceof Error ? e.message : String(e))
          setDetailModalBody(null)
        } finally {
          setDetailModalLoading(false)
        }
      })()
      return
    }
    setDetailModalBody('')
    setDetailModalError(null)
    setDetailModalLoading(false)
  }, [detailModal, supabaseBoardActive, supabaseTickets, ticketStoreConnected, ticketStoreRootHandle, detailModalRetryTrigger])

  const handleOpenTicketDetail = useCallback(
    (cardId: string) => {
      const card = cardsForDisplay[cardId]
      if (card) setDetailModal({ ticketId: cardId, title: card.title })
    },
    [cardsForDisplay]
  )
  const handleCloseTicketDetail = useCallback(() => setDetailModal(null), [])
  const handleRetryTicketDetail = useCallback(() => setDetailModalRetryTrigger((n) => n + 1), [])

  useEffect(() => {
    if (!lastSavedTicketPath) return
    const t = setTimeout(() => {
      setLastSavedTicketPath(null)
      setLastSavedAt(null)
    }, 3000)
    return () => clearTimeout(t)
  }, [lastSavedTicketPath])

  const refreshTicketStore = useCallback(async (root: FileSystemDirectoryHandle) => {
    setTicketStoreLastError(null)
    setLastWriteError(null)
    try {
      const docs = await root.getDirectoryHandle('docs')
      const tickets = await docs.getDirectoryHandle('tickets')
      const files: TicketFile[] = []
      for await (const [name, entry] of tickets.entries()) {
        if (entry.kind === 'file' && name.endsWith('.md')) {
          files.push({ name, path: `docs/tickets/${name}` })
        }
      }
      files.sort((a, b) => a.name.localeCompare(b.name))
      setTicketStoreFiles(files)

      const ticketCardsMap: Record<string, Card> = {}
      const byColumn: Record<string, { path: string; position: number }[]> = {
        'col-unassigned': [],
        'col-todo': [],
        'col-doing': [],
        'col-qa': [],
        'col-human-in-the-loop': [],
        'col-done': [],
        'col-wont-implement': [],
      }
      for (const f of files) {
        ticketCardsMap[f.path] = { id: f.path, title: f.name.replace(/\.md$/, '') }
        try {
          const fileHandle = await tickets.getFileHandle(f.name)
          const file = await fileHandle.getFile()
          const text = await file.text()
          const { frontmatter } = parseFrontmatter(text)
          const kanban = getKanbanFromFrontmatter(frontmatter)
          const colId = kanban.kanbanColumnId && KANBAN_COLUMN_IDS.includes(kanban.kanbanColumnId as (typeof KANBAN_COLUMN_IDS)[number])
            ? kanban.kanbanColumnId
            : 'col-unassigned'
          const pos = typeof kanban.kanbanPosition === 'number' ? kanban.kanbanPosition : 0
          byColumn[colId].push({ path: f.path, position: pos })
        } catch {
          byColumn['col-unassigned'].push({ path: f.path, position: 0 })
        }
      }
      for (const id of KANBAN_COLUMN_IDS) {
        byColumn[id].sort((a, b) => a.position - b.position)
      }
      setTicketCards(ticketCardsMap)
      setTicketColumns([
        { id: 'col-unassigned', title: 'Unassigned', cardIds: byColumn['col-unassigned'].map((x) => x.path) },
        { id: 'col-todo', title: 'To-do', cardIds: byColumn['col-todo'].map((x) => x.path) },
        { id: 'col-doing', title: 'Doing', cardIds: byColumn['col-doing'].map((x) => x.path) },
        { id: 'col-qa', title: 'QA', cardIds: byColumn['col-qa'].map((x) => x.path) },
        { id: 'col-human-in-the-loop', title: 'Human in the Loop', cardIds: byColumn['col-human-in-the-loop'].map((x) => x.path) },
        { id: 'col-done', title: 'Done', cardIds: byColumn['col-done'].map((x) => x.path) },
        { id: 'col-wont-implement', title: 'Will Not Implement', cardIds: byColumn['col-wont-implement'].map((x) => x.path) },
      ])
      setTicketStoreLastRefresh(new Date())
    } catch {
      setTicketStoreLastError('No `docs/tickets` folder found.')
      setTicketStoreFiles([])
      setTicketCards({})
      setTicketColumns(EMPTY_KANBAN_COLUMNS)
      setTicketStoreLastRefresh(new Date())
    }
  }, [])

  const _handleConnectProject = useCallback(async () => {
    setTicketStoreConnectMessage(null)
    if (typeof window.showDirectoryPicker !== 'function') {
      setTicketStoreLastError('Folder picker not supported in this browser.')
      return
    }
    try {
      const root = await window.showDirectoryPicker({ mode: 'readwrite' })
      setTicketStoreConnected(true)
      setTicketStoreRootHandle(root)
      await refreshTicketStore(root)
    } catch (e) {
      const err = e as { name?: string }
      if (err.name === 'AbortError') {
        setTicketStoreConnectMessage('Connect cancelled.')
        return
      }
      setTicketStoreLastError(err instanceof Error ? err.message : 'Failed to open folder.')
    }
  }, [refreshTicketStore])

  const _handleSelectTicket = useCallback(
    async (path: string, name: string) => {
      const root = ticketStoreRootHandle
      if (!root) return
      setSelectedTicketPath(path)
      setTicketViewerLoading(true)
      setSelectedTicketContent(null)
      try {
        const docs = await root.getDirectoryHandle('docs')
        const tickets = await docs.getDirectoryHandle('tickets')
        const fileHandle = await tickets.getFileHandle(name)
        const file = await fileHandle.getFile()
        const text = await file.text()
        setSelectedTicketContent(text)
      } catch {
        setSelectedTicketContent('(Failed to read file.)')
      } finally {
        setTicketViewerLoading(false)
      }
    },
    [ticketStoreRootHandle]
  )

  const _handleRefreshTickets = useCallback(async () => {
    const root = ticketStoreRootHandle
    if (root) await refreshTicketStore(root)
  }, [ticketStoreRootHandle, refreshTicketStore])

  const _handleSupabaseConnect = useCallback(() => {
    connectSupabase(supabaseProjectUrl.trim(), supabaseAnonKey.trim())
  }, [supabaseProjectUrl, supabaseAnonKey, connectSupabase])

  const _handleSelectSupabaseTicket = useCallback((row: SupabaseTicketRow) => {
    setSelectedSupabaseTicketId(row.id)
    setSelectedSupabaseTicketContent(row.body_md ?? '')
  }, [])

  /** Refetch tickets and columns from Supabase (0020). Uses current url/key. */
  const refetchSupabaseTickets = useCallback(async (): Promise<boolean> => {
    const url = supabaseProjectUrl.trim()
    const key = supabaseAnonKey.trim()
    if (!url || !key) return false
    try {
      const client = createClient(url, key)
      const { data: rows, error } = await client
        .from('tickets')
        .select('id, filename, title, body_md, kanban_column_id, kanban_position, kanban_moved_at, updated_at')
        .order('id')
      if (error) {
        setSupabaseLastError(error.message ?? String(error))
        return false
      }
      setSupabaseTickets((rows ?? []) as SupabaseTicketRow[])
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
  }, [supabaseProjectUrl, supabaseAnonKey])

  /** Update one ticket's kanban fields in Supabase (0013). Returns { ok: true } or { ok: false, error: string }. */
  const updateSupabaseTicketKanban = useCallback(
    async (
      id: string,
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
        const { error } = await client.from('tickets').update(updates).eq('id', id)
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

  const addLog = useCallback((message: string) => {
    const at = formatTime()
    const id = Date.now()
    setActionLog((prev) => [...prev.slice(-19), { id, message, at }])
  }, [])

  /** Delete a ticket from Supabase and run sync to remove local file (0030). */
  const handleDeleteTicket = useCallback(
    async (ticketId: string) => {
      const url = supabaseProjectUrl.trim()
      const key = supabaseAnonKey.trim()
      if (!url || !key) {
        setSupabaseLastDeleteError('Supabase not configured. Connect first.')
        return
      }
      const card = supabaseCards[ticketId]
      const label = card ? `"${card.title}" (${ticketId})` : ticketId
      if (!window.confirm(`Delete ticket ${label}? This cannot be undone.`)) return

      setSupabaseLastDeleteError(null)
      try {
        const res = await fetch(`${HAL_API_BASE}/api/tickets/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticketId, supabaseUrl: url, supabaseAnonKey: key }),
        })
        const data = (await res.json()) as { success?: boolean; error?: string }
        if (data.success) {
          // Optimistically remove from state so the board updates immediately
          setSupabaseTickets((prev) => prev.filter((t) => t.id !== ticketId))
          await refetchSupabaseTickets()
          addLog(`Deleted ticket ${ticketId}`)
          if (typeof window !== 'undefined' && window.parent !== window) {
            window.parent.postMessage({ type: 'HAL_SYNC_COMPLETED' }, '*')
          }
        } else {
          const err = data.error ?? `HTTP ${res.status}`
          setSupabaseLastDeleteError(err)
          addLog(`Delete failed: ${err}`)
        }
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e)
        setSupabaseLastDeleteError(err)
        addLog(`Delete failed: ${err}`)
      }
    },
    [supabaseProjectUrl, supabaseAnonKey, supabaseCards, refetchSupabaseTickets, addLog]
  )

  // Polling when Supabase board is active (0013)
  useEffect(() => {
    if (!supabaseBoardActive) return
    const id = setInterval(refetchSupabaseTickets, SUPABASE_POLL_INTERVAL_MS)
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

  const _handlePreviewSync = useCallback(async () => {
    const root = ticketStoreRootHandle
    if (!root) return
    setSupabaseLastSyncError(null)
    const url = supabaseProjectUrl.trim()
    const key = supabaseAnonKey.trim()
    if (!url || !key) return
    try {
      const client = createClient(url, key)
      const { data: rows, error } = await client
        .from('tickets')
        .select('id, filename, title, body_md, kanban_column_id, kanban_position, kanban_moved_at, updated_at')
        .order('id')
      if (error) {
        setSupabaseLastSyncError(error.message ?? String(error))
        setSyncPreview(null)
        return
      }
      const existing = (rows ?? []) as SupabaseTicketRow[]
      const scanResults = await scanDocsTickets(root)
      const preview = buildSyncPreview(scanResults, existing)
      setSyncPreview(preview)
    } catch (e) {
      setSupabaseLastSyncError(e instanceof Error ? e.message : String(e))
      setSyncPreview(null)
    }
  }, [ticketStoreRootHandle, supabaseProjectUrl, supabaseAnonKey])

  /** Write a new file to docs/tickets (Sync: DB→docs). */
  const writeDocTicketFile = useCallback(
    async (root: FileSystemDirectoryHandle, filename: string, content: string): Promise<void> => {
      const docs = await root.getDirectoryHandle('docs')
      const tickets = await docs.getDirectoryHandle('tickets')
      const fileHandle = await tickets.getFileHandle(filename, { create: true })
      if (fileHandle.requestPermission) {
        const perm = await fileHandle.requestPermission({ mode: 'readwrite' })
        if (perm !== 'granted') throw new Error('Write permission denied.')
      }
      const writable = await fileHandle.createWritable()
      await writable.write(content)
      await writable.close()
    },
    []
  )

  const _handleRunSync = useCallback(async () => {
    const root = ticketStoreRootHandle
    if (!root) return
    setSupabaseLastSyncError(null)
    setSyncSummary(null)
    const url = supabaseProjectUrl.trim()
    const key = supabaseAnonKey.trim()
    if (!url || !key) return
    setSyncInProgress(true)
    try {
      const client = createClient(url, key)
      const { data: rows, error } = await client
        .from('tickets')
        .select('id, filename, title, body_md, kanban_column_id, kanban_position, kanban_moved_at, updated_at')
        .order('id')
      if (error) {
        setSupabaseLastSyncError(error.message ?? String(error))
        setSyncInProgress(false)
        setSyncProgressText(null)
        return
      }
      const existing = (rows ?? []) as SupabaseTicketRow[]
      const scanResults = await scanDocsTickets(root)
      const { docsToDb, dbToDocs } = buildSyncPreview(scanResults, existing)
      const toWrite = docsToDb.items.filter((i) => i.action === 'create' || i.action === 'update')
      const parsedByFilename = new Map<string, ParsedDocTicket>()
      for (const r of scanResults) {
        if (r.ok) parsedByFilename.set(r.data.filename, r.data)
      }
      const existingById = new Map(existing.map((r) => [r.id, r]))

      let done = 0
      let created = 0
      let updated = 0
      for (const item of toWrite) {
        setSyncProgressText(`Docs→DB ${done + 1}/${toWrite.length}…`)
        const data = parsedByFilename.get(item.filename)
        if (!data) continue
        const row = {
          id: data.id,
          filename: data.filename,
          title: data.title,
          body_md: data.body_md,
          kanban_column_id: data.kanban_column_id,
          kanban_position: data.kanban_position,
          kanban_moved_at: data.kanban_moved_at,
        }
        const { error: upsertError } = await client.from('tickets').upsert(row, { onConflict: 'id' })
        if (upsertError) {
          setSupabaseLastSyncError(upsertError.message ?? String(upsertError))
          setSyncSummary(`Stopped after ${done} of ${toWrite.length}. Created ${created}, updated ${updated}.`)
          setSyncInProgress(false)
          setSyncProgressText(null)
          return
        }
        if (item.action === 'create') created++
        else updated++
        done++
      }

      let writtenToDocs = 0
      for (let i = 0; i < dbToDocs.length; i++) {
        setSyncProgressText(`DB→Docs ${i + 1}/${dbToDocs.length}…`)
        const { id, filename } = dbToDocs[i]
        const row = existingById.get(id)
        if (!row) continue
        try {
          await writeDocTicketFile(root, filename, row.body_md ?? '')
          writtenToDocs++
        } catch (e) {
          setSupabaseLastSyncError(e instanceof Error ? e.message : String(e))
          setSyncSummary(`Docs→DB: ${created} created, ${updated} updated. DB→Docs: stopped at ${filename}.`)
          setSyncInProgress(false)
          setSyncProgressText(null)
          await refetchSupabaseTickets()
          return
        }
      }

      const { data: afterRows } = await client
        .from('tickets')
        .select('id, kanban_column_id, kanban_position')
        .order('id')
      const afterRefetch = (afterRows ?? []) as SupabaseTicketRow[]
      const { data: colRows } = await client
        .from('kanban_columns')
        .select('id')
        .order('position', { ascending: true })
      const validColumnIds = new Set((colRows ?? []).map((r: { id: string }) => r.id))
      const firstColumnId = (colRows?.[0] as { id: string } | undefined)?.id ?? 'col-unassigned'
      const unassigned = afterRefetch.filter(
        (r) =>
          r.kanban_column_id == null || r.kanban_column_id === '' || !validColumnIds.has(r.kanban_column_id)
      )
      const movedAt = new Date().toISOString()
      for (let i = 0; i < unassigned.length; i++) {
        await client
          .from('tickets')
          .update({
            kanban_column_id: firstColumnId,
            kanban_position: i,
            kanban_moved_at: movedAt,
          })
          .eq('id', unassigned[i].id)
      }

      setSyncProgressText(null)
      setSyncSummary(
        `Docs→DB: ${created} created, ${updated} updated, ${docsToDb.skip} skipped. DB→Docs: ${writtenToDocs} written. Unassigned: ${unassigned.length} in column.`
      )
      await refetchSupabaseTickets()
    } catch (e) {
      setSupabaseLastSyncError(e instanceof Error ? e.message : String(e))
      setSyncSummary(null)
    } finally {
      setSyncInProgress(false)
      setSyncProgressText(null)
      if (typeof window !== 'undefined' && window.parent !== window) {
        window.parent.postMessage({ type: 'HAL_SYNC_COMPLETED' }, '*')
      }
    }
  }, [
    ticketStoreRootHandle,
    supabaseProjectUrl,
    supabaseAnonKey,
    refetchSupabaseTickets,
    writeDocTicketFile,
  ])

  const writeTicketKanbanFrontmatter = useCallback(
    async (
      root: FileSystemDirectoryHandle,
      path: string,
      updates: KanbanFrontmatter
    ): Promise<void> => {
      const name = path.split('/').pop() ?? path
      const docs = await root.getDirectoryHandle('docs')
      const tickets = await docs.getDirectoryHandle('tickets')
      const fileHandle = await tickets.getFileHandle(name, { create: false })
      if (fileHandle.requestPermission) {
        const perm = await fileHandle.requestPermission({ mode: 'readwrite' })
        if (perm !== 'granted') throw new Error('Write permission denied.')
      }
      const file = await fileHandle.getFile()
      const content = await file.text()
      const newContent = updateKanbanInContent(content, updates)
      const writable = await fileHandle.createWritable()
      await writable.write(newContent)
      await writable.close()
    },
    []
  )

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

  const collisionDetection: CollisionDetection = useCallback(
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
    const checkCols = supabaseBoardActive
      ? supabaseColumns
      : ticketStoreConnected
        ? ticketColumns
        : columns
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
    const setCols = ticketStoreConnected ? setTicketColumns : setColumns
    const col: Column = { id: stableColumnId(), title, cardIds: [] }
    setCols((prev) => [...prev, col])
    setNewColumnTitle('')
    setShowAddColumnForm(false)
    addLog(`Column added: "${title}"`)
  }, [
    newColumnTitle,
    ticketStoreConnected,
    ticketColumns,
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
      const cols = ticketStoreConnected ? ticketColumns : columns
      const setCols = ticketStoreConnected ? setTicketColumns : setColumns
      const col = cols.find((c) => c.id === id)
      setCols((prev) => prev.filter((c) => c.id !== id))
      if (col) addLog(`Column removed: "${col.title}"`)
    },
    [ticketStoreConnected, ticketColumns, columns, addLog]
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

        const setCols = ticketStoreConnected ? setTicketColumns : setColumns
        setCols((prev) => {
          const oldIndex = prev.findIndex((c) => c.id === active.id)
          const newIndex = prev.findIndex((c) => c.id === overColumnId)
          if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return prev
          const next = arrayMove(prev, oldIndex, newIndex)
          addLog(`Columns reordered: ${prev.map((c) => c.title).join(',')} -> ${next.map((c) => c.title).join(',')}`)
          return next
        })
        return
      }

      const sourceColumn = findColumnByCardId(String(active.id))
      const overColumn = findColumnById(String(effectiveOverId)) ?? findColumnByCardId(String(effectiveOverId))

      if (!sourceColumn && ticketStoreConnected && ticketStoreRootHandle && overColumn && ticketStoreFiles.some((f) => f.path === active.id)) {
        const path = String(active.id)
        let overIndex = overColumn.cardIds.indexOf(String(effectiveOverId))
        if (overIndex < 0) overIndex = overColumn.cardIds.length
        const prev = ticketColumns.map((c) => ({ ...c, cardIds: [...c.cardIds] }))
        setTicketColumns((prevCols) =>
          prevCols.map((col) =>
            col.id === overColumn.id
              ? { ...col, cardIds: [...col.cardIds.slice(0, overIndex), path, ...col.cardIds.slice(overIndex)] }
              : col
          )
        )
        try {
          await writeTicketKanbanFrontmatter(ticketStoreRootHandle, path, {
            kanbanColumnId: overColumn.id,
            kanbanPosition: overIndex,
            kanbanMovedAt: new Date().toISOString(),
          })
          setLastSavedTicketPath(path)
          setLastSavedAt(new Date())
          setLastWriteError(null)
          addLog(`Ticket dropped into ${overColumn.title}: ${path}`)
        } catch (e) {
          setLastWriteError(e instanceof Error ? e.message : 'Write failed')
          setTicketColumns(prev)
          addLog(`Write failed for ${path}`)
        }
        return
      }

      // Supabase: drag from ticket list into column (0013)
      if (
        !sourceColumn &&
        supabaseBoardActive &&
        overColumn &&
        supabaseTickets.some((t) => t.id === active.id)
      ) {
        const ticketId = String(active.id)
        let overIndex = overColumn.cardIds.indexOf(String(effectiveOverId))
        if (overIndex < 0) overIndex = overColumn.cardIds.length
        const movedAt = new Date().toISOString()
        setSupabaseTickets((prev) =>
          prev.map((t) =>
            t.id === ticketId
              ? { ...t, kanban_column_id: overColumn.id, kanban_position: overIndex, kanban_moved_at: movedAt }
              : t
          )
        )
        const ok = await updateSupabaseTicketKanban(ticketId, {
          kanban_column_id: overColumn.id,
          kanban_position: overIndex,
          kanban_moved_at: movedAt,
        })
        if (ok) {
          addLog(`Supabase ticket ${ticketId} dropped into ${overColumn.title}`)
          setTimeout(() => refetchSupabaseTickets(), REFETCH_AFTER_MOVE_MS)
        } else {
          refetchSupabaseTickets()
          addLog(`Supabase update failed for ${ticketId}`)
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
          setSupabaseTickets((prev) =>
            prev.map((t) => {
              const i = newOrder.indexOf(t.id)
              if (i < 0) return t
              return {
                ...t,
                kanban_position: i,
                ...(t.id === active.id ? { kanban_moved_at: movedAt } : {}),
              }
            })
          )
          for (let i = 0; i < newOrder.length; i++) {
            const id = newOrder[i]
            const result = await updateSupabaseTicketKanban(id, {
              kanban_position: i,
              ...(id === active.id ? { kanban_moved_at: movedAt } : {}),
            })
            if (!result.ok) {
              addLog(`Supabase reorder failed for ${id}: ${result.error}`)
              refetchSupabaseTickets()
              return
            }
          }
          addLog(`Supabase ticket ${active.id} reordered in ${sourceColumn.title}`)
          setTimeout(() => refetchSupabaseTickets(), REFETCH_AFTER_MOVE_MS)
        } else {
          const movedAt = new Date().toISOString()
          setSupabaseTickets((prev) =>
            prev.map((t) =>
              t.id === active.id
                ? { ...t, kanban_column_id: overColumn.id, kanban_position: overIndex, kanban_moved_at: movedAt }
                : t
            )
          )
          const result = await updateSupabaseTicketKanban(String(active.id), {
            kanban_column_id: overColumn.id,
            kanban_position: overIndex,
            kanban_moved_at: movedAt,
          })
          if (result.ok) {
            addLog(`Supabase ticket ${active.id} moved to ${overColumn.title}`)
            setTimeout(() => refetchSupabaseTickets(), REFETCH_AFTER_MOVE_MS)
          } else {
            refetchSupabaseTickets()
            addLog(`Supabase ticket ${active.id} move failed: ${result.error}`)
          }
        }
        return
      }

      const sourceCardIds = sourceColumn.cardIds
      const activeIndex = sourceCardIds.indexOf(String(active.id))
      const isSameColumn = sourceColumn.id === overColumn.id
      const cols = ticketStoreConnected ? ticketColumns : columns
      const setCols = ticketStoreConnected ? setTicketColumns : setColumns
      const cardsMap = cardsForDisplay

      if (isSameColumn) {
        let overIndex = overColumn.cardIds.indexOf(String(effectiveOverId))
        if (overIndex < 0) overIndex = overColumn.cardIds.length
        if (activeIndex === overIndex) return
        const nextCols = cols.map((c) =>
          c.id === sourceColumn.id
            ? { ...c, cardIds: arrayMove(c.cardIds, activeIndex, overIndex) }
            : c
        )
        setCols(nextCols)
        addLog(`Card reordered in ${sourceColumn.title} (card: ${cardsMap[String(active.id)]?.title ?? active.id})`)
        if (ticketStoreConnected && ticketStoreRootHandle) {
          const col = nextCols.find((c) => c.id === sourceColumn.id)
          if (col) {
            try {
              for (let i = 0; i < col.cardIds.length; i++) {
                const p = col.cardIds[i]
                if (!p.startsWith('docs/')) continue
                await writeTicketKanbanFrontmatter(ticketStoreRootHandle, p, {
                  kanbanColumnId: col.id,
                  kanbanPosition: i,
                  ...(p === active.id ? { kanbanMovedAt: new Date().toISOString() } : {}),
                })
              }
              setLastSavedTicketPath(String(active.id))
              setLastSavedAt(new Date())
              setLastWriteError(null)
            } catch (e) {
              setLastWriteError(e instanceof Error ? e.message : 'Write failed')
            }
          }
        }
      } else {
        let overIndex = overColumn.cardIds.indexOf(String(effectiveOverId))
        if (overIndex < 0) overIndex = overColumn.cardIds.length
        const nextCols = cols.map((c) => {
          if (c.id === sourceColumn.id) return { ...c, cardIds: c.cardIds.filter((id) => id !== active.id) }
          if (c.id === overColumn.id) {
            const without = c.cardIds.filter((id) => id !== active.id)
            return { ...c, cardIds: [...without.slice(0, overIndex), String(active.id), ...without.slice(overIndex)] }
          }
          return c
        })
        setCols(nextCols)
        addLog(`Card moved from ${sourceColumn.title} to ${overColumn.title} (${cardsMap[String(active.id)]?.title ?? active.id})`)
        if (ticketStoreConnected && ticketStoreRootHandle) {
          const path = String(active.id)
          if (path.startsWith('docs/')) {
            try {
              await writeTicketKanbanFrontmatter(ticketStoreRootHandle, path, {
                kanbanColumnId: overColumn.id,
                kanbanPosition: overIndex,
                kanbanMovedAt: new Date().toISOString(),
              })
              setLastSavedTicketPath(path)
              setLastSavedAt(new Date())
              setLastWriteError(null)
            } catch (e) {
              setLastWriteError(e instanceof Error ? e.message : 'Write failed')
              setCols(cols)
            }
          }
        }
      }
    },
    [
      ticketStoreConnected,
      ticketStoreRootHandle,
      ticketStoreFiles,
      ticketColumns,
      columns,
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
      writeTicketKanbanFrontmatter,
      cardsForDisplay,
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
    _DraggableTicketItem,
    _DraggableSupabaseTicketItem,
    ticketStoreConnectMessage,
    _supabaseNotInitialized,
    _selectedSupabaseTicketId,
    _selectedSupabaseTicketContent,
    _syncPreview,
    _syncInProgress,
    _syncSummary,
    _syncProgressText,
    _handleSelectTicket,
    _handleRefreshTickets,
    _handleSupabaseConnect,
    _handleSelectSupabaseTicket,
    _handlePreviewSync,
    _handleRunSync,
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
                  hideRemove={ticketStoreConnected || supabaseBoardActive}
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

      <button type="button" className="debug-toggle" onClick={toggleDebug} aria-pressed={debugOpen}>
        Debug {debugOpen ? 'ON' : 'OFF'}
      </button>

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
            <h3>Ticket Store</h3>
            <div className="build-info">
              <p>Store: Docs (read + write when connected with readwrite)</p>
              {!ticketStoreConnected && (
                <button type="button" onClick={_handleConnectProject}>
                  Connect Ticket Store (docs)
                </button>
              )}
              <p>Connected: {String(ticketStoreConnected)}</p>
              <p>Last refresh: {ticketStoreLastRefresh ? ticketStoreLastRefresh.toISOString() : 'never'}</p>
              <p>Last error: {ticketStoreLastError ?? 'none'}</p>
              <p>Last write error: {lastWriteError ?? 'none'}</p>
              <p>Last saved: {lastSavedTicketPath ? `${lastSavedTicketPath} at ${lastSavedAt?.toISOString() ?? ''}` : 'none'}</p>
            </div>
          </section>
          <section>
            <h3>Ticket Store (Supabase)</h3>
            <div className="build-info">
              {supabaseConfigMissing && (
                <p className="debug-env-missing" role="status">
                  Missing env: {[!envUrl && 'VITE_SUPABASE_URL', !envKey && 'VITE_SUPABASE_ANON_KEY'].filter(Boolean).join(', ') || 'none'}
                </p>
              )}
              <p>Connected: {String(supabaseConnectionStatus === 'connected')}</p>
              <p>Project URL present: {String(!!supabaseProjectUrl.trim())}</p>
              <p>Polling: {supabaseBoardActive ? `${SUPABASE_POLL_INTERVAL_MS / 1000}s` : 'off'}</p>
              <p>Last poll time: {supabaseLastRefresh ? supabaseLastRefresh.toISOString() : 'never'}</p>
              <p>Last poll error: {supabaseLastError ?? 'none'}</p>
              <p>Last sync error: {supabaseLastSyncError ?? 'none'}</p>
              <p>Last delete error: {supabaseLastDeleteError ?? 'none'}</p>
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
          {selectedTicketPath && (
            <section>
              <h3>Selected ticket frontmatter</h3>
              <div className="build-info">
                <p>Path: {selectedTicketPath}</p>
                {selectedTicketContent != null && !selectedTicketContent.startsWith('(') && (() => {
                  const { frontmatter } = parseFrontmatter(selectedTicketContent)
                  const kanban = getKanbanFromFrontmatter(frontmatter)
                  return (
                    <>
                      <p>kanbanColumnId: {kanban.kanbanColumnId ?? '(not set)'}</p>
                      <p>kanbanPosition: {kanban.kanbanPosition ?? '(not set)'}</p>
                      <p>kanbanMovedAt: {kanban.kanbanMovedAt ?? '(not set)'}</p>
                    </>
                  )
                })()}
              </div>
            </section>
          )}
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
