import React from 'react'
import type { Column, Card } from '../lib/columnTypes'
import type { SupabaseKanbanColumnRow } from '../lib/canonicalizeColumns'

const SUPABASE_POLL_INTERVAL_MS = 10_000

type LogEntry = { id: number; message: string; at: string }

interface DebugPanelProps {
  columnsForDisplay: Column[]
  cardsForDisplay: Record<string, Card>
  supabaseConfigMissing: boolean
  supabaseConnectionStatus: 'disconnected' | 'connecting' | 'connected'
  supabaseProjectUrl: string
  supabaseBoardActive: boolean
  supabaseLastRefresh: Date | null
  supabaseLastError: string | null
  lastMovePersisted: { success: boolean; timestamp: Date; ticketId: string; error?: string } | null
  pendingMoves: Set<string>
  supabaseColumnsRows: SupabaseKanbanColumnRow[]
  supabaseColumnsLastRefresh: Date | null
  supabaseColumnsLastError: string | null
  supabaseUnknownColumnTicketIds: string[]
  actionLog: LogEntry[]
  runtimeError: string | null
}

export function DebugPanel({
  columnsForDisplay,
  cardsForDisplay,
  supabaseConfigMissing,
  supabaseConnectionStatus,
  supabaseProjectUrl,
  supabaseBoardActive,
  supabaseLastRefresh,
  supabaseLastError,
  lastMovePersisted,
  pendingMoves,
  supabaseColumnsRows,
  supabaseColumnsLastRefresh,
  supabaseColumnsLastError,
  supabaseUnknownColumnTicketIds,
  actionLog,
  runtimeError,
}: DebugPanelProps) {
  const columnOrderDisplay =
    columnsForDisplay.length === 0 ? '(none)' : columnsForDisplay.map((c) => c.title).join(' → ')

  const kanbanCardsDisplay =
    columnsForDisplay.length === 0
      ? '(none)'
      : columnsForDisplay
          .map((c) => `${c.title}: ${c.cardIds.map((id) => cardsForDisplay[id]?.title ?? id).join(',')}`)
          .join(' | ')

  const kanbanColumnTicketIdsDisplay =
    columnsForDisplay.length === 0
      ? '(none)'
      : columnsForDisplay.map((c) => `${c.title}: ${c.cardIds.length ? c.cardIds.join(',') : '(empty)'}`).join(' | ')

  const envUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
  const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

  return (
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
  )
}
