/**
 * Context for when Kanban is embedded as a library inside HAL (no iframe).
 * HAL owns all data: it fetches from Supabase and passes data + callbacks down.
 * Kanban never receives credentials or talks to the DB.
 */

import { createContext } from 'react'
import type { KanbanTicketRow, KanbanColumnRow, KanbanAgentRunRow, KanbanAgentArtifactRow } from './types'

/** Chat target for one-click work buttons (matches HAL's ChatTarget). */
export type HalChatTarget = 'project-manager' | 'implementation-agent' | 'qa-agent' | 'standup'

export interface HalKanbanContextValue {
  /** Tickets (from HAL's Supabase fetch). */
  tickets: KanbanTicketRow[]
  /** Columns (from HAL's Supabase fetch). */
  columns: KanbanColumnRow[]
  /** Agent runs by ticket pk (from HAL). */
  agentRunsByTicketPk: Record<string, KanbanAgentRunRow>
  /** Connected repo full name (e.g. owner/repo). */
  repoFullName: string | null
  /** Theme for styling. */
  theme: 'light' | 'dark'
  /** Called when user moves a ticket to another column. HAL updates Supabase and passes new data. */
  onMoveTicket: (ticketPk: string, columnId: string, position?: number) => void | Promise<void>
  /** Called when user reorders tickets within a column. HAL updates Supabase and passes new data. */
  onReorderColumn?: (columnId: string, orderedTicketPks: string[]) => void | Promise<void>
  /** Called when user updates a ticket body (e.g. in detail modal). HAL updates Supabase and passes new data. */
  onUpdateTicketBody?: (ticketPk: string, bodyMd: string) => void | Promise<void>
  /** Called when user clicks a work button (Prepare/Implement/QA). HAL opens chat and sends the message. */
  onOpenChatAndSend?: (data: { chatTarget: HalChatTarget; message: string; ticketPk?: string }) => void
  /** Ticket ID currently assigned to Implementation Agent (for UI indicator). */
  implementationAgentTicketId: string | null
  /** Ticket ID currently assigned to QA Agent (for UI indicator). */
  qaAgentTicketId: string | null
  /** HAL fetches artifacts from DB and returns them. Called when ticket detail opens so Kanban can show artifacts. */
  fetchArtifactsForTicket?: (ticketPk: string) => Promise<KanbanAgentArtifactRow[]>
  /** Optional: Supabase URL/key for API fallback when callback returns empty (e.g. same-origin POST /api/artifacts/get). */
  supabaseUrl?: string | null
  supabaseAnonKey?: string | null
}

export const HalKanbanContext = createContext<HalKanbanContextValue | null>(null)
