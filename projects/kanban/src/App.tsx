import { useState, useCallback, useRef, useEffect, useMemo, useContext } from 'react'
import { flushSync } from 'react-dom'
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
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { createClient } from '@supabase/supabase-js'
import {
  extractFeatureBranch,
  checkMergedToMain,
  normalizeTitleLineInBody,
} from './lib/ticketBody'
import { normalizeTicketRow } from './lib/normalizeTicketRow'
import { canonicalizeColumnRows, type SupabaseKanbanColumnRow } from './lib/canonicalizeColumns'
import { fetchWithRetry } from './lib/fetchWithRetry'
import { agentTypeToLabel } from './lib/agentTypeLabel'
import { stableColumnId } from './lib/stableColumnId'
import { TicketDetailModal } from './components/TicketDetailModal'
import { QAInfoSection } from './components/QAInfoSection'
import { AutoDismissMessage } from './components/AutoDismissMessage'
import { SortableColumn } from './components/SortableColumn'
import { ArtifactReportViewer } from './components/ArtifactReportViewer'
import { DroppableActiveWorkRow } from './components/DroppableActiveWorkRow'
import { AppHeader } from './components/AppHeader'
import { AddColumnForm } from './components/AddColumnForm'
import { DebugPanel } from './components/DebugPanel'
import type { Card, Column } from './lib/columnTypes'
import type { LogEntry, SupabaseTicketRow, SupabaseAgentArtifactRow, SupabaseAgentRunRow, TicketAttachment } from './App.types'
import { SUPABASE_CONFIG_KEY, CONNECTED_REPO_KEY, SUPABASE_POLL_INTERVAL_MS, SUPABASE_SAFETY_POLL_INTERVAL_MS, REFETCH_AFTER_MOVE_MS, ROLLBACK_AFTER_FAILURE_MS, KANBAN_BROADCAST_CHANNEL, EMPTY_KANBAN_COLUMNS, DEFAULT_KANBAN_COLUMNS_SEED, _SUPABASE_KANBAN_COLUMNS_SETUP_SQL, DEFAULT_COLUMNS, INITIAL_CARDS, _SUPABASE_SETUP_SQL, _SUPABASE_TICKET_ATTACHMENTS_SETUP_SQL } from './App.constants'
import { formatTime, normalizeTitle } from './App.utils'

/** Supabase kanban_columns table row (0020) - use imported type from canonicalizeColumns */

/** Auto-dismiss component for success messages (0047) */
// AutoDismissMessage extracted to components/AutoDismissMessage.tsx
// fetchWithRetry extracted to lib/fetchWithRetry.ts
// stableColumnId extracted to lib/stableColumnId.ts
// extractPriority extracted to components/utils.ts
// getAgentTypeDisplayName extracted to components/utils.ts
// ImageViewerModal extracted to components/ImageViewerModal.tsx
// MarkdownImage extracted to components/MarkdownImage.tsx
// ArtifactReportViewer extracted to components/ArtifactReportViewer.tsx
// DroppableActiveWorkRow extracted to components/DroppableActiveWorkRow.tsx
// SortableCard extracted to components/SortableCard.tsx
// DraggableActiveWorkItem extracted to components/DraggableActiveWorkItem.tsx
// StatusIndicator extracted to components/StatusIndicator.tsx

/** Human validation section component (0085) */
// HumanValidationSection extracted to components/HumanValidationSection.tsx

// ProcessReviewSection extracted to components/ProcessReviewSection.tsx

// ArtifactsSection extracted to components/ArtifactsSection.tsx

// AttachmentsSection extracted to components/AttachmentsSection.tsx

// QAInfoSection extracted to components/QAInfoSection.tsx
// TicketDetailModal extracted to components/TicketDetailModal.tsx

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
  // Ref to always get latest tickets in fetchActiveAgentRuns (0135) - prevents stale closure values
  const supabaseTicketsRef = useRef<SupabaseTicketRow[]>([])
  // Ref to track optimistic ticket positions for same-column reorder (prevents @dnd-kit revert)
  const optimisticTicketPositionsRef = useRef<Map<string, number>>(new Map())
  // State to store optimistic items arrays - using state ensures React re-renders when it changes
  // Using object instead of Map so React can detect changes more reliably
  const [optimisticItems, setOptimisticItems] = useState<Record<string, string[]>>({})
  // Version counter to force SortableContext to remount with new items when optimistic update happens
  const [sortableContextVersion, setSortableContextVersion] = useState(0)
  const [supabaseColumnsRows, setSupabaseColumnsRows] = useState<SupabaseKanbanColumnRow[]>([])
  const [supabaseLastRefresh, setSupabaseLastRefresh] = useState<Date | null>(null)
  const [supabaseColumnsLastRefresh, setSupabaseColumnsLastRefresh] = useState<Date | null>(null)
  const [supabaseColumnsLastError, setSupabaseColumnsLastError] = useState<string | null>(null)
  // Sync status for cross-tab updates (0703)
  const [syncStatus, setSyncStatus] = useState<'realtime' | 'polling'>('polling')
  const [isDragging, setIsDragging] = useState(false)
  const [supabaseColumnsJustInitialized, setSupabaseColumnsJustInitialized] = useState(false)
  const [_supabaseNotInitialized, setSupabaseNotInitialized] = useState(false)
  const [_selectedSupabaseTicketId, setSelectedSupabaseTicketId] = useState<string | null>(null)
  const [_selectedSupabaseTicketContent, setSelectedSupabaseTicketContent] = useState<string | null>(null)
  // Agent runs for Doing column tickets (0114) - kept for compatibility but not used for badges (0135)
  const [agentRunsByTicketPk, setAgentRunsByTicketPk] = useState<Record<string, SupabaseAgentRunRow>>({})
  // Agent type labels for Active work section (0135) - simple string storage based on source column, no DB
  const [activeWorkAgentTypes, setActiveWorkAgentTypes] = useState<Record<string, 'Implementation' | 'QA' | 'Process Review'>>({})
  // Sync with Docs removed (Supabase-only) (0065)
  // Ticket persistence tracking (0047)
  const [lastMovePersisted, setLastMovePersisted] = useState<{ success: boolean; timestamp: Date; ticketId: string; error?: string; isValidationBlock?: boolean; errorCode?: string; ciStatus?: { overall: string; evaluatedSha?: string; failingCheckNames?: string[]; checksPageUrl?: string }; unmetCount?: number; unmetIndices?: number[]; inconsistentDocs?: string[]; driftCheckPassed?: boolean } | null>(null)
  const [pendingMoves, setPendingMoves] = useState<Set<string>>(new Set())
  // Track when each move was initiated to prevent premature rollback on slow API responses (0790)
  const [pendingMoveTimestamps, setPendingMoveTimestamps] = useState<Map<string, number>>(new Map())

  // Ticket detail modal (0033): click card opens modal; content from Supabase or docs
  const [detailModal, setDetailModal] = useState<{ ticketId: string; title: string; columnId: string | null } | null>(null)
  const [detailModalBody, setDetailModalBody] = useState<string | null>(null)
  const [detailModalError, setDetailModalError] = useState<string | null>(null)
  const [detailModalLoading, setDetailModalLoading] = useState(false)
  const [detailModalRetryTrigger, setDetailModalRetryTrigger] = useState(0)
  // Track the last ticket ID and retry trigger we fetched artifacts for to prevent unnecessary refetches
  const lastFetchedTicketIdRef = useRef<string | null>(null)
  const lastFetchedRetryTriggerRef = useRef<number>(0)
  
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
  // Sync status: use from context (library mode) or local state (standalone mode)
  const effectiveSyncStatus = halCtx?.syncStatus ?? syncStatus
  const effectiveLastSync = halCtx?.lastSync ?? supabaseLastRefresh
  const { columns: supabaseColumns, unknownColumnTicketIds: supabaseUnknownColumnTicketIds } = useMemo(() => {
    if (!supabaseBoardActive || sourceColumnsRows.length === 0) {
      return { columns: EMPTY_KANBAN_COLUMNS, unknownColumnTicketIds: [] as string[] }
    }
    const columnIds = new Set(sourceColumnsRows.map((c) => c.id))
    const firstColumnId = sourceColumnsRows[0].id
    const byColumn: Record<
      string,
      { id: string; position: number | null; movedAt: string | null; stableIndex: number }[]
    > = {}
    for (const c of sourceColumnsRows) {
      byColumn[c.id] = []
    }
    const unknownIds: string[] = []
    for (let stableIndex = 0; stableIndex < sourceTickets.length; stableIndex++) {
      const t = sourceTickets[stableIndex]
      const colId =
        t.kanban_column_id == null || t.kanban_column_id === ''
          ? firstColumnId
          : columnIds.has(t.kanban_column_id)
            ? t.kanban_column_id
            : (unknownIds.push(t.pk), firstColumnId)
      // Use optimistic position if available (for same-column reorder to prevent @dnd-kit revert)
      const optimisticPos = optimisticTicketPositionsRef.current.get(t.pk)
      const basePos =
        typeof t.kanban_position === 'number' && Number.isFinite(t.kanban_position)
          ? t.kanban_position
          : null
      const pos = optimisticPos !== undefined ? optimisticPos : basePos
      byColumn[colId].push({
        id: t.pk,
        position: typeof pos === 'number' && Number.isFinite(pos) ? pos : null,
        movedAt: t.kanban_moved_at ?? null,
        stableIndex,
      })
    }
    // If optimisticItems has a new order for a column, use that order instead of sorting by position
    for (const [colId, optimisticOrder] of Object.entries(optimisticItems)) {
      if (byColumn[colId] && optimisticOrder && optimisticOrder.length === byColumn[colId].length) {
        // Reorder byColumn[colId] to match optimisticOrder
        const orderMap = new Map<string, number>(optimisticOrder.map((id: string, idx: number) => [id, idx]))
        byColumn[colId].sort((a, b) => {
          const aIdx = orderMap.get(a.id) ?? Infinity
          const bIdx = orderMap.get(b.id) ?? Infinity
          return aIdx - bIdx
        })
      }
    }
    // Sort columns that don't have optimistic items
    for (const id of Object.keys(byColumn)) {
      if (!(id in optimisticItems)) {
        const NULL_POS_SENTINEL = 1_000_000_000
        byColumn[id].sort((a, b) => {
          const pa = a.position === null ? NULL_POS_SENTINEL : a.position
          const pb = b.position === null ? NULL_POS_SENTINEL : b.position
          if (pa !== pb) return pa - pb

          // If both positions are null, use movedAt (newer first) as a non-ID tiebreaker.
          if (a.position === null && b.position === null) {
            const ta = a.movedAt ? Date.parse(a.movedAt) : 0
            const tb = b.movedAt ? Date.parse(b.movedAt) : 0
            if (ta !== tb) return tb - ta
          }

          // Final tiebreaker: preserve incoming (stable) order; never sort by ticket number.
          return a.stableIndex - b.stableIndex
        })
      }
    }
    // CRITICAL: Always create new array references to ensure @dnd-kit sees items as changed
    const columns: Column[] = sourceColumnsRows.map((c) => ({
      id: c.id,
      title: c.title,
      // Use Array.from() to ensure new array reference every time
      cardIds: Array.from(byColumn[c.id]?.map((x) => x.id) ?? []),
    }))
    return { columns, unknownColumnTicketIds: unknownIds }
  }, [supabaseBoardActive, sourceColumnsRows, sourceTickets, optimisticItems])
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
          // Do NOT order by ticket_number: Kanban order is owned by kanban_position (plus moved_at as a non-ID tiebreaker).
          .order('kanban_column_id', { ascending: true })
          .order('kanban_position', { ascending: true })
          .order('kanban_moved_at', { ascending: false })
          .order('pk', { ascending: true })
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
      // Fetch active agent runs (status not 'finished' or 'failed') for these tickets (0690: include current_stage)
      const { data, error } = await client
        .from('hal_agent_runs')
        .select('run_id, agent_type, repo_full_name, ticket_pk, ticket_number, display_id, status, current_stage, created_at, updated_at')
        .eq('repo_full_name', connectedRepoFullName)
        .in('ticket_pk', ticketPks)
        // Filter for active runs: any status that's not 'completed' or 'failed' (0690)
        // Includes: 'preparing', 'fetching_ticket', 'resolving_repo', 'fetching_branch', 'launching', 'running', 'reviewing', 'polling', 'generating_report', 'merging', 'moving_ticket'
        // Also includes old status values for backward compatibility: 'created', 'finished' (though 'finished' should be 'completed' now)
        .in('status', ['preparing', 'fetching_ticket', 'resolving_repo', 'fetching_branch', 'launching', 'running', 'reviewing', 'polling', 'generating_report', 'merging', 'moving_ticket', 'created', 'finished'])
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
      lastFetchedTicketIdRef.current = null
      lastFetchedRetryTriggerRef.current = 0
      return
    }
    const { ticketId } = detailModal
    
    // Only fetch artifacts if ticket ID changed or retry was triggered
    // This prevents refetching when supabaseTickets updates during polling
    const ticketIdChanged = lastFetchedTicketIdRef.current !== ticketId
    const retryTriggerChanged = lastFetchedRetryTriggerRef.current !== detailModalRetryTrigger
    const shouldFetchArtifacts = ticketIdChanged || retryTriggerChanged
    if (shouldFetchArtifacts) {
      lastFetchedTicketIdRef.current = ticketId
      lastFetchedRetryTriggerRef.current = detailModalRetryTrigger
    }
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
      
      // Only fetch artifacts if ticket ID changed or retry was triggered
      if (shouldFetchArtifacts) {
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
      } else {
        // Ticket ID hasn't changed - don't refetch artifacts, but still update body if it changed
        // (body updates are handled above)
      }
      
      // Fetch failure counts in library mode (0195) - only on ticket change, not on every sourceTickets update
      if (shouldFetchArtifacts) {
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
        
        // Only fetch artifacts if ticket ID changed or retry was triggered
        if (shouldFetchArtifacts) {
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
        }
        
        // Fetch attachments (0092) - only on ticket change, not on every supabaseTickets update
        if (shouldFetchArtifacts) {
          setDetailModalAttachmentsLoading(true)
          fetchTicketAttachments(row.id).then((attachments) => {
            setDetailModalAttachments(attachments)
            setDetailModalAttachmentsLoading(false)
          }).catch(() => {
            setDetailModalAttachments([])
            setDetailModalAttachmentsLoading(false)
          })
        }
        
        // Fetch failure counts (0195) - only on ticket change, not on every supabaseTickets update
        if (shouldFetchArtifacts) {
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
  // Note: supabaseTickets and sourceTickets are in dependencies to read ticket data,
  // but artifacts are only fetched when ticketId changes (tracked via lastFetchedTicketIdRef)

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
    // Skip refresh if user is dragging (0703)
    if (isDragging) return { success: false }
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
          // Do NOT order by ticket_number: Kanban order is owned by kanban_position (plus moved_at as a non-ID tiebreaker).
          .order('kanban_column_id', { ascending: true })
          .order('kanban_position', { ascending: true })
          .order('kanban_moved_at', { ascending: false })
          .order('pk', { ascending: true })
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
  }, [supabaseProjectUrl, supabaseAnonKey, pendingMoves, connectedRepoFullName, isDragging])

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

  /** Move ticket via HAL API endpoint (for moves beyond To Do to enforce drift gating). Returns { ok: true } or { ok: false, error: string, actionableSteps?: string }. */
  const moveTicketViaHalApi = useCallback(
    async (
      ticketPk: string,
      columnId: string,
      position?: number
    ): Promise<{ ok: true; driftCheckPassed?: boolean } | { ok: false; error: string; actionableSteps?: string; missingArtifacts?: string[]; errorCode?: string; ciStatus?: any; unmetCount?: number; unmetIndices?: number[]; inconsistentDocs?: string[] }> => {
      try {
        // Get API base URL from environment or use current origin
        const apiBaseUrl = import.meta.env.VITE_HAL_API_BASE_URL || window.location.origin
        const response = await fetch(`${apiBaseUrl}/api/tickets/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketPk,
            columnId,
            position,
          }),
        })

        const result = await response.json()

        if (!result.success) {
          // Build actionable error message from API response
          let errorMessage = result.error || 'Unknown error'
          let actionableSteps: string | undefined
          
          // If drift gating failed, include actionable steps
          if (result.missingArtifacts && Array.isArray(result.missingArtifacts) && result.missingArtifacts.length > 0) {
            const missingList = result.missingArtifacts.join(', ')
            actionableSteps = result.remedy || `Missing required artifacts: ${missingList}. Please add the missing artifacts and try again.`
            errorMessage = `${errorMessage} ${actionableSteps}`
          } else if (result.remedy) {
            actionableSteps = result.remedy
            errorMessage = `${errorMessage} ${actionableSteps}`
          }

          return { 
            ok: false, 
            error: errorMessage,
            actionableSteps,
            missingArtifacts: result.missingArtifacts,
            errorCode: result.errorCode,
            ciStatus: result.ciStatus,
            unmetCount: result.unmetCount,
            unmetIndices: result.unmetIndices,
            inconsistentDocs: result.inconsistentDocs,
          }
        }

        // Success - drift check passed
        return { ok: true, driftCheckPassed: true }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { ok: false, error: `Failed to move ticket via HAL API: ${msg}` }
      }
    },
    []
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
  // 0703: Use safety polling (60s) when realtime is connected, normal polling (10s) when not.
  useEffect(() => {
    if (halCtx || !supabaseBoardActive) return
    const pollInterval = syncStatus === 'realtime' ? SUPABASE_SAFETY_POLL_INTERVAL_MS : SUPABASE_POLL_INTERVAL_MS
    const id = setInterval(() => {
      // Skip refresh if user is dragging (0703)
      if (isDragging) return
      refetchSupabaseTickets(true).then((result) => {
        // Pass fresh tickets to fetchActiveAgentRuns to ensure accurate badges (0135)
        if (result.freshTickets) {
          fetchActiveAgentRuns(result.freshTickets)
        } else {
          fetchActiveAgentRuns()
        }
      })
    }, pollInterval)
    return () => clearInterval(id)
  }, [halCtx, supabaseBoardActive, syncStatus, isDragging, refetchSupabaseTickets, fetchActiveAgentRuns])

  // Fetch agent runs when board becomes active (0114). Skip when library mode (HAL passes agentRunsByTicketPk).
  // NOTE: We don't depend on supabaseTickets here to avoid stale data issues (0135).
  // Instead, fetchActiveAgentRuns is called explicitly after refetches with fresh tickets.
  useEffect(() => {
    if (halCtx || !supabaseBoardActive || !connectedRepoFullName) return
    // Only fetch on initial mount or when repo/board becomes active, not on every ticket change
    fetchActiveAgentRuns()
  }, [halCtx, supabaseBoardActive, connectedRepoFullName, fetchActiveAgentRuns])

  // Supabase Realtime subscription for cross-tab updates (0703)
  useEffect(() => {
    if (halCtx || !supabaseBoardActive || !connectedRepoFullName || !supabaseProjectUrl?.trim() || !supabaseAnonKey?.trim()) {
      setSyncStatus('polling')
      return
    }

    const url = supabaseProjectUrl.trim()
    const key = supabaseAnonKey.trim()
    const client = createClient(url, key)

    // Subscribe to ticket changes
    const channel = client
      .channel('kanban-tickets-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tickets',
          filter: `repo_full_name=eq.${connectedRepoFullName}`,
        },
        (_payload) => {
          // Skip refresh if user is dragging (0703)
          if (isDragging) return
          
          // Update last sync time (0703)
          setSupabaseLastRefresh(new Date())
          
          // Trigger refetch when tickets change
          refetchSupabaseTickets(true).then((result) => {
            if (result.freshTickets) {
              fetchActiveAgentRuns(result.freshTickets)
            } else {
              fetchActiveAgentRuns()
            }
          }).catch((err) => {
            // Non-blocking error: log but don't disrupt UI (0703)
            console.warn('[Kanban] Realtime subscription refetch error:', err)
          })
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setSyncStatus('realtime')
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setSyncStatus('polling')
        }
      })

    return () => {
      channel.unsubscribe()
      setSyncStatus('polling')
    }
  }, [halCtx, supabaseBoardActive, connectedRepoFullName, supabaseProjectUrl, supabaseAnonKey, isDragging, refetchSupabaseTickets, fetchActiveAgentRuns])

  // BroadcastChannel for cross-tab communication (0703)
  useEffect(() => {
    if (halCtx || !supabaseBoardActive || typeof BroadcastChannel === 'undefined') return

    const channel = new BroadcastChannel(KANBAN_BROADCAST_CHANNEL)

    // Listen for ticket move events from other tabs
    channel.onmessage = (event) => {
      if (event.data?.type === 'TICKET_MOVED') {
        // Skip refresh if user is dragging (0703)
        if (isDragging) return
        
        // Update last sync time (0703)
        setSupabaseLastRefresh(new Date())
        
        // Trigger refetch when ticket is moved in another tab
        refetchSupabaseTickets(true).then((result) => {
          if (result.freshTickets) {
            fetchActiveAgentRuns(result.freshTickets)
          } else {
            fetchActiveAgentRuns()
          }
        }).catch((err) => {
          // Non-blocking error: log but don't disrupt UI (0703)
          console.warn('[Kanban] BroadcastChannel refetch error:', err)
        })
      }
    }

    return () => {
      channel.close()
    }
  }, [halCtx, supabaseBoardActive, isDragging, refetchSupabaseTickets, fetchActiveAgentRuns])

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
      setIsDragging(true) // Prevent refresh during drag (0703)
      if (!isColumnId(event.active.id)) setActiveCardId(event.active.id)
    },
    [isColumnId]
  )

  const handleDragOver = useCallback((event: any) => {
    // For same-column reorder, update optimistic items during drag so @dnd-kit sees the change
    // This prevents the revert because @dnd-kit will see items have changed before drag end
    if (!supabaseBoardActive) return
    
    const { active, over } = event
    if (!active || !over) return
    
    const sourceColumn = findColumnByCardId(String(active.id))
    if (!sourceColumn) return
    
    // Check if over is the same column (could be a card or the column itself)
    const overColumn = findColumnById(String(over.id)) ?? findColumnByCardId(String(over.id))
    if (!overColumn || sourceColumn.id !== overColumn.id) return
    
      // Same-column reorder - update optimistic items immediately
      const sourceCardIds = sourceColumn.cardIds
      const activeIndex = sourceCardIds.indexOf(String(active.id))
      let overIndex = sourceCardIds.indexOf(String(over.id))
      if (overIndex < 0) {
        // over.id might be the column id, not a card id - use column length
        overIndex = sourceCardIds.length
      }
      
      if (activeIndex >= 0 && activeIndex !== overIndex) {
        const newOrder = arrayMove(sourceCardIds, activeIndex, overIndex)
        // Update optimistic items state immediately so @dnd-kit sees the change
        setOptimisticItems((prev) => ({
          ...prev,
          [sourceColumn.id]: [...newOrder], // New array reference
        }))
      }
  }, [supabaseBoardActive, findColumnByCardId, findColumnById])

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      // Don't set isDragging to false until AFTER optimistic update renders
      // This prevents polling from interfering with the optimistic update
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

      // Library mode: ticket dropped into column (HAL owns data) - includes Active Work items (0669)
      if (halCtx && !sourceColumn && overColumn && sourceTickets.some((t) => t.pk === String(active.id))) {
        const ticketPk = String(active.id)
        let overIndex = overColumn.cardIds.indexOf(String(effectiveOverId))
        if (overIndex < 0) overIndex = overColumn.cardIds.length
        halCtx.onMoveTicket(ticketPk, overColumn.id, overIndex)
        return
      }
      
      // Library mode: ticket dropped into Active Work (col-doing) - 0669
      if (halCtx && sourceColumn && effectiveOverId === 'col-doing' && sourceTickets.some((t) => t.pk === String(active.id))) {
        const ticketPk = String(active.id)
        halCtx.onMoveTicket(ticketPk, 'col-doing')
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
              isValidationBlock: true,
            })
            addLog(`Move blocked: ${errorMsg}`)
            alert(errorMsg)
            return
          }
        }
        
        let overIndex = overColumn.cardIds.indexOf(String(effectiveOverId))
        if (overIndex < 0) overIndex = overColumn.cardIds.length
        const movedAt = new Date().toISOString()
        const moveStartTime = Date.now()
        // Optimistic update (0047) - ticket appears immediately in destination column (0790)
        setPendingMoves((prev) => new Set(prev).add(ticketPk))
        // Track move start time to prevent premature rollback on slow API responses (0790)
        setPendingMoveTimestamps((prev) => {
          const next = new Map(prev)
          next.set(ticketPk, moveStartTime)
          return next
        })
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
          // col-todo or col-unassigned → Implementation, col-qa → QA, col-process-review → Process Review, others → Unassigned
          const sourceColumnId = ticket?.kanban_column_id || null
          let agentType: 'Implementation' | 'QA' | 'Process Review' | null = null
          if (sourceColumnId === 'col-todo' || sourceColumnId === 'col-unassigned' || !sourceColumnId) {
            agentType = 'Implementation'
          } else if (sourceColumnId === 'col-qa') {
            agentType = 'QA'
          } else if (sourceColumnId === 'col-process-review') {
            agentType = 'Process Review'
          }
          // Set badge immediately based on source column (0135)
          if (agentType) {
            setActiveWorkAgentTypes((prev) => ({ ...prev, [ticketPk]: agentType! }))
          }
        }
        
        // Pre-compute updated tickets outside flushSync for better performance
        const updatedTickets = supabaseTickets.map((t) =>
          t.pk === ticketPk
            ? { ...t, kanban_column_id: overColumn.id, kanban_position: overIndex, kanban_moved_at: movedAt }
            : t
        )
        // Use flushSync to force immediate rendering of optimistic update
        flushSync(() => {
          setSupabaseTickets(updatedTickets)
        })
        // Set isDragging to false AFTER optimistic update to prevent polling from interfering
        setIsDragging(false)
        // Use HAL API for moves beyond To Do to enforce drift gating (0770)
        // Moves to col-todo or col-unassigned can use direct Supabase write (no drift gating required)
        const isMovingToTodoOrUnassigned = overColumn.id === 'col-todo' || overColumn.id === 'col-unassigned'
        const result = isMovingToTodoOrUnassigned
          ? await updateSupabaseTicketKanban(ticketPk, {
              kanban_column_id: overColumn.id,
              kanban_position: overIndex,
              kanban_moved_at: movedAt,
            })
          : await moveTicketViaHalApi(ticketPk, overColumn.id, overIndex)
        if (result.ok) {
          // Notify other tabs via BroadcastChannel (0703)
          if (typeof BroadcastChannel !== 'undefined') {
            try {
              const channel = new BroadcastChannel(KANBAN_BROADCAST_CHANNEL)
              channel.postMessage({ type: 'TICKET_MOVED', ticketPk })
              channel.close()
            } catch (e) {
              // Ignore BroadcastChannel errors (e.g., in environments where it's not supported)
            }
          }
          setLastMovePersisted({ 
            success: true, 
            timestamp: new Date(), 
            ticketId: ticketPk,
            driftCheckPassed: 'driftCheckPassed' in result && result.driftCheckPassed === true,
          })
          addLog(`Move succeeded: Ticket moved to ${overColumn.title}`)
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
                    // Clear move timestamp on success (0790)
                    setPendingMoveTimestamps((prev) => {
                      const next = new Map(prev)
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
                setPendingMoveTimestamps((prev) => {
                  const next = new Map(prev)
                  next.delete(ticketPk)
                  return next
                })
              })
            }, REFETCH_AFTER_MOVE_MS)
        } else {
          // Move failed - wait for rollback delay before reverting to give slow API responses time to succeed (0790)
          // Include actionable steps in error message if provided (0770)
          const errorMessage = 'actionableSteps' in result && result.actionableSteps
            ? `${result.error}\n\nNext steps: ${result.actionableSteps}`
            : result.error
          
          // Show error message immediately (0790)
          setLastMovePersisted({ 
            success: false, 
            timestamp: new Date(), 
            ticketId: ticketPk, 
            error: errorMessage,
            errorCode: 'errorCode' in result && typeof result.errorCode === 'string' ? result.errorCode : undefined,
            unmetCount: 'unmetCount' in result && typeof result.unmetCount === 'number' ? result.unmetCount : undefined,
            unmetIndices: 'unmetIndices' in result && Array.isArray(result.unmetIndices) ? result.unmetIndices : undefined,
            inconsistentDocs: 'inconsistentDocs' in result && Array.isArray(result.inconsistentDocs) ? result.inconsistentDocs : undefined,
          })
          addLog(`Move failed: ${errorMessage}`)
          
          // Wait for rollback delay before reverting optimistic update (0790)
          // This gives slow HAL API moves time to succeed and prevents premature "move back" behavior
          const moveStartTimeFromMap = pendingMoveTimestamps.get(ticketPk) || moveStartTime
          const timeSinceMoveStart = Date.now() - moveStartTimeFromMap
          const remainingDelay = Math.max(0, ROLLBACK_AFTER_FAILURE_MS - timeSinceMoveStart)
          
          setTimeout(() => {
            // Double-check that move still failed (it might have succeeded in the meantime)
            // Only revert if ticket is still in pendingMoves (hasn't been confirmed as successful)
            setPendingMoves((currentPending) => {
              if (!currentPending.has(ticketPk)) {
                // Move was already confirmed successful, don't revert
                return currentPending
              }
              
              // Move still pending after delay - revert optimistic update
              const next = new Set(currentPending)
              next.delete(ticketPk)
              
              // Revert ticket position by refetching from backend
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
              
              return next
            })
            
            // Clear move timestamp after rollback (0790)
            setPendingMoveTimestamps((prev) => {
              const next = new Map(prev)
              next.delete(ticketPk)
              return next
            })
          }, remainingDelay)
        }
        return
      }

      // Handle drag to Active Work (col-doing) - 0669
      const isDroppingOnActiveWork = effectiveOverId === 'col-doing'
      if (isDroppingOnActiveWork && sourceColumn && supabaseBoardActive) {
        const ticketPk = String(active.id)
        const ticket = supabaseTickets.find((t) => t.pk === ticketPk)
        if (!ticket) return
        
        // Calculate position in Active Work (col-doing)
        const doingTickets = supabaseTickets.filter((t) => t.kanban_column_id === 'col-doing')
        const overIndex = doingTickets.length // Append to end
        const movedAt = new Date().toISOString()
        const moveStartTime = Date.now()
        
        // Optimistic update - ticket appears immediately in destination column (0790)
        setPendingMoves((prev) => new Set(prev).add(ticketPk))
        // Track move start time to prevent premature rollback on slow API responses (0790)
        setPendingMoveTimestamps((prev) => {
          const next = new Map(prev)
          next.set(ticketPk, moveStartTime)
          return next
        })
        
        // Immediately update agent runs state when ticket moves to Doing (0135)
        const sourceColumnId = ticket.kanban_column_id || null
        let agentType: 'Implementation' | 'QA' | 'Process Review' | null = null
        if (sourceColumnId === 'col-todo' || sourceColumnId === 'col-unassigned' || !sourceColumnId) {
          agentType = 'Implementation'
        } else if (sourceColumnId === 'col-qa') {
          agentType = 'QA'
        } else if (sourceColumnId === 'col-process-review') {
          agentType = 'Process Review'
        }
        if (agentType) {
          setActiveWorkAgentTypes((prev) => ({ ...prev, [ticketPk]: agentType! }))
        }
        
        // Pre-compute updated tickets outside flushSync for better performance
        const updatedTickets = supabaseTickets.map((t) =>
          t.pk === ticketPk
            ? { ...t, kanban_column_id: 'col-doing', kanban_position: overIndex, kanban_moved_at: movedAt }
            : t
        )
        // Use flushSync to force immediate rendering of optimistic update
        flushSync(() => {
          setSupabaseTickets(updatedTickets)
        })
        // Set isDragging to false AFTER optimistic update to prevent polling from interfering
        setIsDragging(false)
        
        // Use HAL API for moves to Doing (beyond To Do) to enforce drift gating (0770)
        const result = await moveTicketViaHalApi(ticketPk, 'col-doing', overIndex)
        
        if (result.ok) {
          // Notify other tabs via BroadcastChannel (0703)
          if (typeof BroadcastChannel !== 'undefined') {
            try {
              const channel = new BroadcastChannel(KANBAN_BROADCAST_CHANNEL)
              channel.postMessage({ type: 'TICKET_MOVED', ticketPk })
              channel.close()
            } catch (e) {
              // Ignore BroadcastChannel errors
            }
          }
          setLastMovePersisted({ 
            success: true, 
            timestamp: new Date(), 
            ticketId: ticketPk,
            driftCheckPassed: 'driftCheckPassed' in result && result.driftCheckPassed === true,
          })
          addLog(`Move succeeded: Ticket moved to Active Work`)
          const expectedColumnId = 'col-doing'
          const expectedPosition = overIndex
          setTimeout(() => {
            refetchSupabaseTickets(false).then((result) => {
              setSupabaseTickets((currentTickets) => {
                const currentTicket = currentTickets.find((t) => t.pk === ticketPk)
                if (currentTicket && 
                    currentTicket.kanban_column_id === expectedColumnId && 
                    currentTicket.kanban_position === expectedPosition) {
                  setPendingMoves((prev) => {
                    if (!prev.has(ticketPk)) return prev
                    const next = new Set(prev)
                    next.delete(ticketPk)
                    return next
                  })
                  // Clear move timestamp on success (0790)
                  setPendingMoveTimestamps((prev) => {
                    const next = new Map(prev)
                    next.delete(ticketPk)
                    return next
                  })
                }
                return currentTickets
              })
              if (result.freshTickets) {
                fetchActiveAgentRuns(result.freshTickets)
              } else if (fetchActiveAgentRuns) {
                fetchActiveAgentRuns()
              }
            }).catch(() => {
              setPendingMoves((prev) => {
                const next = new Set(prev)
                next.delete(ticketPk)
                return next
              })
              setPendingMoveTimestamps((prev) => {
                const next = new Map(prev)
                next.delete(ticketPk)
                return next
              })
            })
          }, REFETCH_AFTER_MOVE_MS)
        } else {
          // Move failed - wait for rollback delay before reverting to give slow API responses time to succeed (0790)
          // Include actionable steps in error message if provided (0770)
          const errorMessage = result.actionableSteps 
            ? `${result.error}\n\nNext steps: ${result.actionableSteps}`
            : result.error
          
          // Show error message immediately (0790)
          setLastMovePersisted({ 
            success: false, 
            timestamp: new Date(), 
            ticketId: ticketPk, 
            error: errorMessage,
            errorCode: 'errorCode' in result && typeof result.errorCode === 'string' ? result.errorCode : undefined,
            ciStatus: 'ciStatus' in result && typeof result.ciStatus === 'object' && result.ciStatus !== null ? result.ciStatus as { overall: string; evaluatedSha?: string; failingCheckNames?: string[]; checksPageUrl?: string } : undefined,
            unmetCount: 'unmetCount' in result && typeof result.unmetCount === 'number' ? result.unmetCount : undefined,
            unmetIndices: 'unmetIndices' in result && Array.isArray(result.unmetIndices) ? result.unmetIndices : undefined,
            inconsistentDocs: 'inconsistentDocs' in result && Array.isArray(result.inconsistentDocs) ? result.inconsistentDocs : undefined,
          })
          addLog(`Move failed: ${errorMessage}`)
          
          // Wait for rollback delay before reverting optimistic update (0790)
          const moveStartTimeFromMap = pendingMoveTimestamps.get(ticketPk) || moveStartTime
          const timeSinceMoveStart = Date.now() - moveStartTimeFromMap
          const remainingDelay = Math.max(0, ROLLBACK_AFTER_FAILURE_MS - timeSinceMoveStart)
          
          setTimeout(() => {
            // Double-check that move still failed (it might have succeeded in the meantime)
            setPendingMoves((currentPending) => {
              if (!currentPending.has(ticketPk)) {
                // Move was already confirmed successful, don't revert
                return currentPending
              }
              
              // Move still pending after delay - revert optimistic update
              const next = new Set(currentPending)
              next.delete(ticketPk)
              
              // Revert ticket position by refetching from backend
              refetchSupabaseTickets(false).then((result) => {
                if (result.freshTickets) {
                  fetchActiveAgentRuns(result.freshTickets)
                } else {
                  fetchActiveAgentRuns()
                }
              })
              
              return next
            })
            
            // Clear move timestamp after rollback (0790)
            setPendingMoveTimestamps((prev) => {
              const next = new Map(prev)
              next.delete(ticketPk)
              return next
            })
          }, remainingDelay)
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
          const moveStartTime = Date.now()
          
          // CRITICAL: Update optimistic items IMMEDIATELY (synchronously)
          // This must happen before @dnd-kit checks items at drag end
          setOptimisticItems((prev) => ({
            ...prev,
            [sourceColumn.id]: [...newOrder], // New array reference - ensures React sees change
          }))
          
          // Also update optimistic positions ref for useMemo fallback
          const positionMap = new Map<string, number>()
          newOrder.forEach((pk, i) => {
            positionMap.set(pk, i)
            optimisticTicketPositionsRef.current.set(pk, i)
          })
          
          // Pre-compute updated tickets
          const updatedTickets = supabaseTickets.map((t) => {
            const newPos = positionMap.get(t.pk)
            if (newPos === undefined) return t
            return {
              ...t,
              kanban_position: newPos,
              ...(t.pk === ticketPk ? { kanban_moved_at: movedAt } : {}),
            }
          })
          
          // Update state synchronously
          setPendingMoves((prev) => new Set(prev).add(ticketPk))
          setPendingMoveTimestamps((prev) => {
            const next = new Map(prev)
            next.set(ticketPk, moveStartTime)
            return next
          })
          setSupabaseTickets(updatedTickets)
          
          // Force immediate render
          flushSync(() => {
            setSortableContextVersion((v) => v + 1)
          })
          // Fire off all API calls in parallel WITHOUT awaiting - let them complete in background
          // This allows React to render the optimistic update immediately (fixes 5-10s delay)
          const updatePromises = newOrder.map((pk, i) =>
            updateSupabaseTicketKanban(pk, {
              kanban_position: i,
              ...(pk === ticketPk ? { kanban_moved_at: movedAt } : {}),
            })
          )
          // Store expected optimistic position to verify backend confirmation (0144)
          const expectedColumnId = sourceColumn.id
          const expectedPosition = overIndex
          
          // Handle API results asynchronously without blocking the handler return
          Promise.allSettled(updatePromises).then((results) => {
            let allSucceeded = true
            let firstError: string | undefined
            for (let i = 0; i < results.length; i++) {
              const result = results[i]
              if (result.status === 'rejected') {
                allSucceeded = false
                if (!firstError) firstError = result.reason?.message || String(result.reason)
                addLog(`Supabase reorder failed: ${result.reason}`)
              } else if (result.value && !result.value.ok) {
                allSucceeded = false
                if (!firstError) firstError = result.value.error
                addLog(`Supabase reorder failed: ${result.value.error}`)
              }
            }
            if (allSucceeded) {
              setLastMovePersisted({ success: true, timestamp: new Date(), ticketId: ticketPk })
              addLog(`Supabase ticket reordered in ${sourceColumn.title}`)
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
                    // Clear move timestamp on success (0790)
                    setPendingMoveTimestamps((prev) => {
                      const next = new Map(prev)
                      next.delete(ticketPk)
                      return next
                    })
                    // Clear optimistic positions and items for this column since backend confirmed
                    optimisticTicketPositionsRef.current.clear()
                    setOptimisticItems((prev) => {
                      const { [sourceColumn.id]: _, ...rest } = prev
                      return rest
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
                setPendingMoveTimestamps((prev) => {
                  const next = new Map(prev)
                  next.delete(ticketPk)
                  return next
                })
              })
              }, REFETCH_AFTER_MOVE_MS)
            } else {
              // Same-column reorder failed - wait for rollback delay before reverting (0790)
              // Show error message immediately
              setLastMovePersisted({ success: false, timestamp: new Date(), ticketId: ticketPk, error: firstError })
              addLog(`Supabase reorder failed: ${firstError}`)
              
              // Wait for rollback delay before reverting optimistic update (0790)
              const moveStartTimeFromMap = pendingMoveTimestamps.get(ticketPk) || moveStartTime
              const timeSinceMoveStart = Date.now() - moveStartTimeFromMap
              const remainingDelay = Math.max(0, ROLLBACK_AFTER_FAILURE_MS - timeSinceMoveStart)
              
              setTimeout(() => {
                // Double-check that move still failed
                setPendingMoves((currentPending) => {
                  if (!currentPending.has(ticketPk)) {
                    // Move was already confirmed successful, don't revert
                    return currentPending
                  }
                  
                  // Move still pending after delay - revert optimistic update
                  const next = new Set(currentPending)
                  next.delete(ticketPk)
                  refetchSupabaseTickets(false) // Full refetch to restore correct state
                  return next
                })
                
                // Clear move timestamp after rollback (0790)
                setPendingMoveTimestamps((prev) => {
                  const next = new Map(prev)
                  next.delete(ticketPk)
                  return next
                })
                // Clear optimistic positions and items on rollback
                optimisticTicketPositionsRef.current.clear()
                setOptimisticItems((prev) => {
                  const { [sourceColumn.id]: _, ...rest } = prev
                  return rest
                })
              }, remainingDelay)
            }
          })
          // Set isDragging to false AFTER optimistic update to prevent polling from interfering
          setIsDragging(false)
          // Handler returns immediately - React can render optimistic update while API calls complete in background
          return
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
                  isValidationBlock: true,
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
            // col-todo or col-unassigned → Implementation, col-qa → QA, col-process-review → Process Review, others → Unassigned
            const sourceColumnId = sourceTicket?.kanban_column_id || null
            let agentType: 'Implementation' | 'QA' | 'Process Review' | null = null
            if (sourceColumnId === 'col-todo' || sourceColumnId === 'col-unassigned' || !sourceColumnId) {
              agentType = 'Implementation'
            } else if (sourceColumnId === 'col-qa') {
              agentType = 'QA'
            } else if (sourceColumnId === 'col-process-review') {
              agentType = 'Process Review'
            }
            // Set badge immediately based on source column (0135)
            if (agentType) {
              setActiveWorkAgentTypes((prev) => ({ ...prev, [ticketPk]: agentType! }))
            }
          }
          
          const moveStartTime = Date.now()
          // Optimistic update (0047) - ticket appears immediately in destination column (0790)
          // Pre-compute updated tickets outside flushSync for better performance
          const updatedTickets = supabaseTickets.map((t) =>
            t.pk === ticketPk
              ? { ...t, kanban_column_id: overColumn.id, kanban_position: overIndex, kanban_moved_at: movedAt }
              : t
          )
          // Use flushSync to force immediate rendering of optimistic update
          flushSync(() => {
            setPendingMoves((prev) => new Set(prev).add(ticketPk))
            // Track move start time to prevent premature rollback on slow API responses (0790)
            setPendingMoveTimestamps((prev) => {
              const next = new Map(prev)
              next.set(ticketPk, moveStartTime)
              return next
            })
            setSupabaseTickets(updatedTickets)
          })
          // Set isDragging to false AFTER optimistic update to prevent polling from interfering
          setIsDragging(false)
          // Use HAL API for moves beyond To Do to enforce drift gating (0770)
          // Moves to col-todo or col-unassigned can use direct Supabase write (no drift gating required)
          const isMovingToTodoOrUnassigned = overColumn.id === 'col-todo' || overColumn.id === 'col-unassigned'
          const result = isMovingToTodoOrUnassigned
            ? await updateSupabaseTicketKanban(ticketPk, {
                kanban_column_id: overColumn.id,
                kanban_position: overIndex,
                kanban_moved_at: movedAt,
              })
            : await moveTicketViaHalApi(ticketPk, overColumn.id, overIndex)
          if (result.ok) {
            setLastMovePersisted({ success: true, timestamp: new Date(), ticketId: ticketPk })
            addLog(`Move succeeded: Ticket moved to ${overColumn.title}`)
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
                    // Clear move timestamp on success (0790)
                    setPendingMoveTimestamps((prev) => {
                      const next = new Map(prev)
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
                setPendingMoveTimestamps((prev) => {
                  const next = new Map(prev)
                  next.delete(ticketPk)
                  return next
                })
              })
            }, REFETCH_AFTER_MOVE_MS)
          } else {
            // Move failed - wait for rollback delay before reverting to give slow API responses time to succeed (0790)
            // Include actionable steps in error message if provided (0770)
            const errorMessage = 'actionableSteps' in result && result.actionableSteps
              ? `${result.error}\n\nNext steps: ${result.actionableSteps}`
              : result.error
            
            // Show error message immediately (0790)
            setLastMovePersisted({ 
              success: false, 
              timestamp: new Date(), 
              ticketId: ticketPk, 
              error: errorMessage,
              errorCode: 'errorCode' in result && typeof result.errorCode === 'string' ? result.errorCode : undefined,
              ciStatus: 'ciStatus' in result && typeof result.ciStatus === 'object' && result.ciStatus !== null ? result.ciStatus as { overall: string; evaluatedSha?: string; failingCheckNames?: string[]; checksPageUrl?: string } : undefined,
            })
            addLog(`Move failed: ${errorMessage}`)
            
            // Wait for rollback delay before reverting optimistic update (0790)
            const moveStartTimeFromMap = pendingMoveTimestamps.get(ticketPk) || moveStartTime
            const timeSinceMoveStart = Date.now() - moveStartTimeFromMap
            const remainingDelay = Math.max(0, ROLLBACK_AFTER_FAILURE_MS - timeSinceMoveStart)
            
            setTimeout(() => {
              // Double-check that move still failed (it might have succeeded in the meantime)
              setPendingMoves((currentPending) => {
                if (!currentPending.has(ticketPk)) {
                  // Move was already confirmed successful, don't revert
                  return currentPending
                }
                
                // Move still pending after delay - revert optimistic update
                const next = new Set(currentPending)
                next.delete(ticketPk)
                
                // Revert ticket position by refetching from backend
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
                
                return next
              })
              
              // Clear move timestamp after rollback (0790)
              setPendingMoveTimestamps((prev) => {
                const next = new Map(prev)
                next.delete(ticketPk)
                return next
              })
            }, remainingDelay)
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
      moveTicketViaHalApi,
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
      <AppHeader
        isEmbedded={isEmbedded}
        projectFolderHandle={projectFolderHandle}
        projectName={projectName}
        supabaseConnectionStatus={supabaseConnectionStatus}
        syncStatus={effectiveSyncStatus}
        lastSync={effectiveLastSync}
        onConnectProjectFolder={handleConnectProjectFolder}
        onDisconnect={() => {
          setProjectFolderHandle(null)
          setProjectName(null)
          setSupabaseConnectionStatus('disconnected')
          setSupabaseTickets([])
          setSupabaseColumnsRows([])
        }}
        onOpenNewHalWizard={() => {
          setNewHalWizardOpen(true)
          setNewHalReport(null)
        }}
      />

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
            <>
              ✓ Move succeeded: Ticket moved successfully at {lastMovePersisted.timestamp.toLocaleTimeString()}
              {lastMovePersisted.driftCheckPassed && (
                <div style={{ marginTop: '8px', padding: '8px', backgroundColor: 'rgba(46, 125, 50, 0.1)', borderRadius: '4px', fontSize: '0.9em' }}>
                  <strong>Drift check passed</strong> — All acceptance criteria met, CI checks passing, and documentation consistent.
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ whiteSpace: 'pre-line' }}>
                ✗ {lastMovePersisted.isValidationBlock ? 'Move blocked' : 'Move failed'}: {lastMovePersisted.error ?? 'Unknown error'}
                {lastMovePersisted.errorCode === 'NO_PR_REQUIRED' && (
                  <div style={{ marginTop: '8px', padding: '8px', backgroundColor: 'rgba(255, 193, 7, 0.1)', borderRadius: '4px' }}>
                    <strong>No PR linked:</strong> A GitHub Pull Request must be linked to this ticket before it can be moved to this column. The drift gate requires CI checks to pass before allowing transitions.
                  </div>
                )}
                {lastMovePersisted.errorCode === 'UNMET_AC_BLOCKER' && (
                  <div style={{ marginTop: '8px', padding: '8px', backgroundColor: 'rgba(220, 53, 69, 0.1)', borderRadius: '4px' }}>
                    <strong>Unmet Acceptance Criteria:</strong> {lastMovePersisted.unmetCount || 0} acceptance criteria item(s) are marked as unmet.
                    {lastMovePersisted.unmetIndices && lastMovePersisted.unmetIndices.length > 0 && (
                      <div style={{ marginTop: '4px', fontSize: '0.9em' }}>
                        Unmet AC indices: {lastMovePersisted.unmetIndices.map((idx) => idx + 1).join(', ')}
                      </div>
                    )}
                    <div style={{ marginTop: '4px', fontSize: '0.9em' }}>
                      Mark all acceptance criteria as "Met" in the ticket details panel before moving to this column.
                    </div>
                  </div>
                )}
                {lastMovePersisted.errorCode === 'CI_CHECKS_FAILING' && lastMovePersisted.ciStatus && (
                  <div style={{ marginTop: '8px', padding: '8px', backgroundColor: 'rgba(220, 53, 69, 0.1)', borderRadius: '4px' }}>
                    <strong>CI Status: {lastMovePersisted.ciStatus.overall === 'failing' ? 'Failing' : lastMovePersisted.ciStatus.overall === 'running' ? 'Running' : lastMovePersisted.ciStatus.overall === 'pending' ? 'Pending' : 'Unknown'}</strong>
                    {lastMovePersisted.ciStatus.evaluatedSha && (
                      <div style={{ fontSize: '0.9em', marginTop: '4px' }}>
                        Evaluated SHA: <code style={{ fontSize: '0.85em' }}>{lastMovePersisted.ciStatus.evaluatedSha.substring(0, 7)}</code>
                      </div>
                    )}
                    {lastMovePersisted.ciStatus.failingCheckNames && lastMovePersisted.ciStatus.failingCheckNames.length > 0 && (
                      <div style={{ marginTop: '4px' }}>
                        <strong>Failing checks:</strong>
                        <ul style={{ margin: '4px 0 0 20px', padding: 0 }}>
                          {lastMovePersisted.ciStatus.failingCheckNames.map((name, idx) => (
                            <li key={idx}>{name}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {lastMovePersisted.ciStatus.checksPageUrl && (
                      <div style={{ marginTop: '8px' }}>
                        <a 
                          href={lastMovePersisted.ciStatus.checksPageUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          style={{ color: '#0066cc', textDecoration: 'underline' }}
                        >
                          View checks on GitHub →
                        </a>
                      </div>
                    )}
                  </div>
                )}
                {lastMovePersisted.errorCode === 'DOCS_INCONSISTENT' && lastMovePersisted.inconsistentDocs && lastMovePersisted.inconsistentDocs.length > 0 && (
                  <div style={{ marginTop: '8px', padding: '8px', backgroundColor: 'rgba(220, 53, 69, 0.1)', borderRadius: '4px' }}>
                    <strong>Documentation Inconsistencies:</strong> The following documents are inconsistent with code:
                    <ul style={{ margin: '4px 0 0 20px', padding: 0 }}>
                      {lastMovePersisted.inconsistentDocs.map((path, idx) => (
                        <li key={idx} style={{ fontSize: '0.9em' }}>{path}</li>
                      ))}
                    </ul>
                    <div style={{ marginTop: '4px', fontSize: '0.9em' }}>
                      Fix documentation inconsistencies and ensure all docs are consistent with code before moving to this column.
                    </div>
                  </div>
                )}
              </div>
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
              <button type="button" className="modal-close btn-destructive" onClick={() => setNewHalWizardOpen(false)}>
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
              <button type="button" className="primary btn-standard" onClick={generateNewHalReport}>
                Generate bootstrap report
              </button>
              <button
                type="button"
                className="btn-standard"
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
                  className="btn-standard"
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
                  className="btn-standard"
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
                <button type="button" className="primary btn-standard" onClick={runWizardBootstrap}>
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
          repoFullName={
            supabaseBoardActive
              ? supabaseTickets.find((t) => t.pk === detailModal.ticketId)?.repo_full_name || null
              : sourceTickets.find((t) => t.pk === detailModal.ticketId)?.repo_full_name || null
          }
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

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        {/* Active work row: shows tickets in Doing column (0145) - now inside DndContext for drag-and-drop (0669) */}
        {supabaseBoardActive && <DroppableActiveWorkRow
          doingTickets={doingTickets}
          activeWorkAgentTypes={activeWorkAgentTypes}
          agentRunsByTicketPk={halCtx?.agentRunsByTicketPk || agentRunsByTicketPk}
          onOpenDetail={handleOpenTicketDetail}
          pendingMoves={pendingMoves}
        />}

        <section className="columns-section" aria-label="Columns">
          {!isEmbedded && (
            <>
              <button
                type="button"
                className="add-column-btn btn-standard"
                onClick={() => {
                  setAddColumnError(null)
                  setShowAddColumnForm(true)
                }}
                aria-expanded={showAddColumnForm}
              >
                Add column
              </button>
              {showAddColumnForm && (
                <AddColumnForm
                  newColumnTitle={newColumnTitle}
                  addColumnError={addColumnError}
                  onTitleChange={(title) => {
                    setNewColumnTitle(title)
                    setAddColumnError(null)
                  }}
                  onCreate={handleCreateColumn}
                  onCancel={handleCancelAddColumn}
                />
              )}
            </>
          )}
          <SortableContext
            items={columnsForDisplay.map((c) => c.id)}
            strategy={horizontalListSortingStrategy}
          >
            <div className={`columns-row ${isDragging ? 'columns-row-dragging' : ''}`}>
              {columnsForDisplay.map((col) => (
                <SortableColumn
                  key={col.id}
                  col={col}
                  cards={cardsForDisplay}
                  onRemove={handleRemoveColumn}
                  hideRemove={supabaseBoardActive}
                  onOpenDetail={handleOpenTicketDetail}
                  sortableContextVersion={sortableContextVersion}
                  optimisticItems={optimisticItems}
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
          {activeCardId ? (
            cardsForDisplay[String(activeCardId)] ? (
              <div className="ticket-card" data-card-id={activeCardId}>
                <div className="ticket-card-top-row">
                  <span className="ticket-card-drag-handle" aria-hidden />
                  <span className="ticket-card-title">{cardsForDisplay[String(activeCardId)].title}</span>
                </div>
              </div>
            ) : supabaseBoardActive && doingTickets.some((t) => t.pk === String(activeCardId)) ? (
              (() => {
                const ticket = doingTickets.find((t) => t.pk === String(activeCardId))
                if (!ticket) return null
                const displayId = ticket.display_id || (ticket.ticket_number ? `HAL-${String(ticket.ticket_number).padStart(4, '0')}` : null)
                const ticketIdentifier = displayId ? `${displayId}: ${ticket.title}` : ticket.title
                const effectiveRunsByPk = halCtx?.agentRunsByTicketPk || agentRunsByTicketPk
                const run = effectiveRunsByPk[ticket.pk]
                const agentLabel = agentTypeToLabel(run?.agent_type) ?? activeWorkAgentTypes[ticket.pk] ?? null
                return (
                  <div className="active-work-item" data-ticket-pk={ticket.pk}>
                    <div className="active-work-item-title">{ticketIdentifier}</div>
                    <div className="active-work-item-meta">
                      <span className="active-work-item-agent">{agentLabel || 'Unassigned'}</span>
                    </div>
                  </div>
                )
              })()
            ) : null
          ) : null}
        </DragOverlay>
      </DndContext>

      {!isEmbedded && (
        <button type="button" className="debug-toggle btn-standard" onClick={toggleDebug} aria-pressed={debugOpen}>
          Debug {debugOpen ? 'ON' : 'OFF'}
        </button>
      )}

      {debugOpen && (
        <DebugPanel
          columnsForDisplay={columnsForDisplay}
          columnOrderDisplay={columnOrderDisplay}
          kanbanCardsDisplay={kanbanCardsDisplay}
          kanbanColumnTicketIdsDisplay={kanbanColumnTicketIdsDisplay}
          supabaseConfigMissing={supabaseConfigMissing}
          envUrl={envUrl}
          envKey={envKey}
          supabaseConnectionStatus={supabaseConnectionStatus}
          supabaseProjectUrl={supabaseProjectUrl}
          supabaseBoardActive={supabaseBoardActive}
          supabaseLastRefresh={supabaseLastRefresh}
          supabaseLastError={supabaseLastError}
          lastMovePersisted={lastMovePersisted}
          pendingMoves={pendingMoves}
          supabaseBoardActiveForColumns={supabaseBoardActive}
          supabaseColumnsRows={supabaseColumnsRows}
          supabaseColumnsLastRefresh={supabaseColumnsLastRefresh}
          supabaseColumnsLastError={supabaseColumnsLastError}
          supabaseUnknownColumnTicketIds={supabaseUnknownColumnTicketIds}
          actionLog={actionLog}
          runtimeError={runtimeError}
        />
      )}
    </>
  )
}

export default App
