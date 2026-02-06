/**
 * Tools for QA and Implementation agents to interact with Supabase via HAL API.
 * These tools call HAL's API endpoints which use server-side environment variables,
 * so agents don't need direct Supabase credentials.
 */

import { tool } from 'ai'
import { z } from 'zod'

export interface QaToolsConfig {
  /** HAL API base URL (e.g. http://localhost:5173 or https://your-domain.com) */
  halApiUrl?: string
  /** Optional Supabase credentials (if provided, tools can use direct Supabase access as fallback) */
  supabaseUrl?: string
  supabaseAnonKey?: string
}

/**
 * Create tools for QA/Implementation agents to interact with Supabase.
 * Tools call HAL API endpoints which use server-side env vars for Supabase access.
 * 
 * Note: This is for agents running through HAL's agent system. For cloud agents,
 * use the tool call contract (send JSON in messages) instead.
 */
export function createQaTools(config: QaToolsConfig): Record<string, any> {
  const apiUrl = config.halApiUrl || 'http://localhost:5173'

  const tools: Record<string, any> = {}

  // Insert/update QA artifact in Supabase
  tools.insert_qa_artifact = tool({
    description:
      'Insert or update a QA artifact for a ticket in Supabase. The artifact is stored in the agent_artifacts table and linked to the ticket. Use this after completing QA to store the QA report.',
    parameters: z.object({
      ticket_id: z.string().describe('Ticket ID (e.g. "0076")'),
      title: z.string().describe('Artifact title (e.g. "QA report for ticket 0076")'),
      body_md: z.string().describe('Full markdown content of the QA report'),
    }),
    execute: async (input) => {
      try {
        const requestBody: any = {
          ticketId: input.ticket_id,
          title: input.title,
          body_md: input.body_md,
        }
        // Include credentials in body if available (for backward compatibility)
        if (config.supabaseUrl) requestBody.supabaseUrl = config.supabaseUrl
        if (config.supabaseAnonKey) requestBody.supabaseAnonKey = config.supabaseAnonKey

        const response = await fetch(`${apiUrl}/api/artifacts/insert-qa`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        })

        const result = await response.json()
        if (!result.success) {
          return { success: false, error: result.error || 'Failed to insert QA artifact' }
        }

        return {
          success: true,
          ticketId: input.ticket_id,
          artifact_id: result.artifact_id,
          action: result.action,
        }
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    },
  }) as any

  // Insert/update implementation artifacts
  tools.insert_implementation_artifact = tool({
    description:
      'Insert or update an implementation artifact for a ticket in Supabase. Can insert multiple artifacts (plan, worklog, changed-files, decisions, verification, pm-review).',
    parameters: z.object({
      ticket_id: z.string().describe('Ticket ID (e.g. "0076")'),
      artifact_type: z
        .enum(['plan', 'worklog', 'changed-files', 'decisions', 'verification', 'pm-review'])
        .describe('Type of artifact to insert'),
      title: z.string().describe('Artifact title'),
      body_md: z.string().describe('Full markdown content of the artifact'),
    }),
    execute: async (input) => {
      try {
        const requestBody: any = {
          ticketId: input.ticket_id,
          artifactType: input.artifact_type,
          title: input.title,
          body_md: input.body_md,
        }
        // Include credentials in body if available (for backward compatibility)
        if (config.supabaseUrl) requestBody.supabaseUrl = config.supabaseUrl
        if (config.supabaseAnonKey) requestBody.supabaseAnonKey = config.supabaseAnonKey

        const response = await fetch(`${apiUrl}/api/artifacts/insert-implementation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        })

        const result = await response.json()
        if (!result.success) {
          return { success: false, error: result.error || 'Failed to insert implementation artifact' }
        }

        return {
          success: true,
          ticketId: input.ticket_id,
          artifact_id: result.artifact_id,
          action: result.action,
        }
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    },
  }) as any

  // Move ticket to any column
  tools.move_ticket_column = tool({
    description:
      'Move a ticket to a different Kanban column (e.g. col-qa, col-human-in-the-loop, col-todo). Uses HAL API which has Supabase credentials.',
    parameters: z.object({
      ticket_id: z.string().describe('Ticket ID (e.g. "0076")'),
      column_id: z
        .string()
        .describe(
          'Target column ID (e.g. "col-qa", "col-human-in-the-loop", "col-todo", "col-unassigned")'
        ),
    }),
    execute: async (input) => {
      try {
        const requestBody: any = {
          ticketId: input.ticket_id,
          columnId: input.column_id,
        }
        // Include credentials in body if available (for backward compatibility)
        if (config.supabaseUrl) requestBody.supabaseUrl = config.supabaseUrl
        if (config.supabaseAnonKey) requestBody.supabaseAnonKey = config.supabaseAnonKey

        const response = await fetch(`${apiUrl}/api/tickets/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        })

        const result = await response.json()
        if (!result.success) {
          return { success: false, error: result.error || 'Failed to move ticket' }
        }

        return {
          success: true,
          ticketId: input.ticket_id,
          columnId: input.column_id,
          position: result.position,
          movedAt: result.movedAt,
        }
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    },
  }) as any

  // Update ticket body
  tools.update_ticket_body = tool({
    description:
      'Update a ticket\'s body_md in Supabase. Supabase is the source of truth—this is how you edit a ticket. The Kanban UI reflects the change within ~10 seconds.',
    parameters: z.object({
      ticket_id: z.string().describe('Ticket ID (e.g. "0076")'),
      body_md: z.string().describe('Full markdown body of the ticket'),
    }),
    execute: async (input) => {
      try {
        const requestBody: any = {
          ticketId: input.ticket_id,
          body_md: input.body_md,
        }
        // Include credentials in body if available (for backward compatibility)
        if (config.supabaseUrl) requestBody.supabaseUrl = config.supabaseUrl
        if (config.supabaseAnonKey) requestBody.supabaseAnonKey = config.supabaseAnonKey

        const response = await fetch(`${apiUrl}/api/tickets/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        })

        const result = await response.json()
        if (!result.success) {
          return { success: false, error: result.error || 'Failed to update ticket' }
        }

        return {
          success: true,
          ticketId: input.ticket_id,
        }
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    },
  }) as any

  // Get ticket content
  tools.fetch_ticket_content = tool({
    description: 'Fetch the full ticket content (body_md, title, id) from Supabase for a ticket.',
    parameters: z.object({
      ticket_id: z.string().describe('Ticket ID (e.g. "0076")'),
    }),
    execute: async (input) => {
      try {
        const requestBody: any = {
          ticketId: input.ticket_id,
        }
        // Include credentials in body if available (for backward compatibility)
        if (config.supabaseUrl) requestBody.supabaseUrl = config.supabaseUrl
        if (config.supabaseAnonKey) requestBody.supabaseAnonKey = config.supabaseAnonKey

        const response = await fetch(`${apiUrl}/api/tickets/get`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        })

        const result = await response.json()
        if (!result.success) {
          return { success: false, error: result.error || 'Failed to fetch ticket' }
        }

        return {
          success: true,
          body_md: result.body_md || '',
        }
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    },
  }) as any

  return tools
}
