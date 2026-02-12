/**
 * Public library entry: Kanban board component for HAL.
 * HAL owns all data (fetches from Supabase) and passes data + callbacks; no credentials.
 */

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
  theme: 'light' | 'dark'
  onMoveTicket: (ticketPk: string, columnId: string, position?: number) => void | Promise<void>
  onReorderColumn?: (columnId: string, orderedTicketPks: string[]) => void | Promise<void>
  onUpdateTicketBody?: (ticketPk: string, bodyMd: string) => void | Promise<void>
  onOpenChatAndSend?: (data: {
    chatTarget: import('./HalKanbanContext').HalChatTarget
    message: string
    ticketPk?: string
  }) => void
  onProcessReview?: (data: { ticketPk: string; ticketId?: string }) => void | Promise<void>
  processReviewRunningForTicketPk?: string | null
  implementationAgentTicketId?: string | null
  qaAgentTicketId?: string | null
  /** HAL fetches artifacts from DB; called when ticket detail opens. */
  fetchArtifactsForTicket?: (ticketPk: string) => Promise<import('./types').KanbanAgentArtifactRow[]>
  /** Optional: for API fallback when callback returns empty. */
  supabaseUrl?: string | null
  supabaseAnonKey?: string | null
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
    ]
  )

  return (
    <HalKanbanContext.Provider value={value}>
      <KanbanBoardInner />
    </HalKanbanContext.Provider>
  )
}

export default KanbanBoard
