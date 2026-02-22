import type { LogEntry } from '../App.types'
import { SUPABASE_POLL_INTERVAL_MS } from '../App.constants'

interface DebugPanelProps {
  columnsForDisplay: Array<{ id: string; title: string; cardIds: string[] }>
  columnOrderDisplay: string
  kanbanCardsDisplay: string
  kanbanColumnTicketIdsDisplay: string
  supabaseConfigMissing: boolean
  envUrl: string
  envKey: string
  supabaseConnectionStatus: 'disconnected' | 'connecting' | 'connected'
  supabaseProjectUrl: string
  supabaseBoardActive: boolean
  supabaseLastRefresh: Date | null
  supabaseLastError: string | null
  lastMovePersisted: { 
    success: boolean
    timestamp: Date
    ticketId: string
    error?: string
    isValidationBlock?: boolean
    ciStatus?: {
      overallStatus: 'passing' | 'failing' | 'pending' | 'running' | 'unknown'
      failingChecks?: string[]
      checksUrl?: string
      headSha?: string
    }
  } | null
  pendingMoves: Set<string>
  supabaseBoardActiveForColumns: boolean
  supabaseColumnsRows: Array<{ id: string; title: string; position: number }>
  supabaseColumnsLastRefresh: Date | null
  supabaseColumnsLastError: string | null
  supabaseUnknownColumnTicketIds: string[]
  actionLog: LogEntry[]
  runtimeError: string | null
}

export function DebugPanel({
  columnsForDisplay,
  columnOrderDisplay,
  kanbanCardsDisplay,
  kanbanColumnTicketIdsDisplay,
  supabaseConfigMissing,
  envUrl,
  envKey,
  supabaseConnectionStatus,
  supabaseProjectUrl,
  supabaseBoardActive,
  supabaseLastRefresh,
  supabaseLastError,
  lastMovePersisted,
  pendingMoves,
  supabaseBoardActiveForColumns,
  supabaseColumnsRows,
  supabaseColumnsLastRefresh,
  supabaseColumnsLastError,
  supabaseUnknownColumnTicketIds,
  actionLog,
  runtimeError,
}: DebugPanelProps) {
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
          {supabaseBoardActiveForColumns && (
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
