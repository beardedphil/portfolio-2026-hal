/**
 * Public library entry: Kanban board component for HAL.
 * HAL owns all data (fetches from Supabase) and passes data + callbacks; no credentials.
 */

/** Build identifier: bump when deploying so HAL can confirm which kanban build is loaded (inspect data-kanban-build on root). Export for HAL diagnostics. */
export const KANBAN_BUILD = '70d27a4'

import React from 'react'
import { HalKanbanContext, type HalKanbanContextValue } from './HalKanbanContext'
import type { KanbanTicketRow, KanbanColumnRow, KanbanAgentRunRow } from './types'
import KanbanBoardInner from './App'

export type { HalKanbanContextValue, HalChatTarget } from './HalKanbanContext'
export type { KanbanTicketRow, KanbanColumnRow, KanbanAgentRunRow, KanbanAgentArtifactRow } from './types'

export interface KanbanBoardProps {
  tickets: KanbanTicketRow[]
  columns: KanbanColumnRow[]
  agentRunsByTicketPk?: Record<string, KanbanAgentRunRow>
  repoFullName: string | null
  theme: 'light' | 'dark' | 'lcars'
  onMoveTicket: (ticketPk: string, columnId: string, position?: number) => void | Promise<void>
  onReorderColumn?: (columnId: string, orderedTicketPks: string[]) => void | Promise<void>
  onUpdateTicketBody?: (ticketPk: string, bodyMd: string) => void | Promise<void>
  onOpenChatAndSend?: (data: {
    chatTarget: import('./HalKanbanContext').HalChatTarget
    message: string
    ticketPk?: string
  }) => void
  /** Called when user clicks Process Review button. HAL triggers Process Review agent for the ticket. */
  onProcessReview?: (data: { ticketPk: string; ticketId?: string }) => void | Promise<void>
  /** Ticket PK currently being reviewed by Process Review agent (for UI indicator/button disabled state). */
  processReviewRunningForTicketPk?: string | null
  implementationAgentTicketId?: string | null
  qaAgentTicketId?: string | null
  /** HAL fetches artifacts from DB; called when ticket detail opens. */
  fetchArtifactsForTicket?: (ticketPk: string) => Promise<import('./types').KanbanAgentArtifactRow[]>
  /** Optional: for API fallback when callback returns empty. */
  supabaseUrl?: string | null
  supabaseAnonKey?: string | null
  /** Called when a ticket is created (e.g. via Process Review). HAL should refresh its Kanban data. */
  onTicketCreated?: () => void | Promise<void>
  /** Sync status: 'realtime' when Supabase realtime is connected, 'polling' when using polling fallback. */
  syncStatus?: 'realtime' | 'polling'
  /** Timestamp of last successful sync (realtime event or polling fetch). */
  lastSync?: Date | null
}

export function KanbanBoard({
  tickets,
  columns,
  agentRunsByTicketPk = {},
  repoFullName,
  theme,
  onMoveTicket,
  onReorderColumn,
  onUpdateTicketBody,
  onOpenChatAndSend,
  onProcessReview,
  processReviewRunningForTicketPk = null,
  implementationAgentTicketId = null,
  qaAgentTicketId = null,
  fetchArtifactsForTicket,
  supabaseUrl = null,
  supabaseAnonKey = null,
  onTicketCreated,
  syncStatus,
  lastSync,
}: KanbanBoardProps) {
  const value: HalKanbanContextValue = React.useMemo(
    () => ({
      tickets,
      columns,
      agentRunsByTicketPk,
      repoFullName,
      theme,
      onMoveTicket,
      onReorderColumn,
      onUpdateTicketBody,
      onOpenChatAndSend,
      onProcessReview,
      processReviewRunningForTicketPk,
      implementationAgentTicketId,
      qaAgentTicketId,
      fetchArtifactsForTicket,
      supabaseUrl,
      supabaseAnonKey,
      onTicketCreated,
      syncStatus,
      lastSync,
    }),
    [
      tickets,
      columns,
      agentRunsByTicketPk,
      repoFullName,
      theme,
      onMoveTicket,
      onReorderColumn,
      onUpdateTicketBody,
      onOpenChatAndSend,
      onProcessReview,
      processReviewRunningForTicketPk,
      implementationAgentTicketId,
      qaAgentTicketId,
      fetchArtifactsForTicket,
      supabaseUrl,
      supabaseAnonKey,
      onTicketCreated,
      syncStatus,
      lastSync,
    ]
  )

  return (
    <HalKanbanContext.Provider value={value}>
      <div data-kanban-build={KANBAN_BUILD} style={{ display: 'contents' }}>
        <KanbanBoardInner />
      </div>
    </HalKanbanContext.Provider>
  )
}

export default KanbanBoard
