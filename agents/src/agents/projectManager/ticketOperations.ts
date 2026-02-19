/**
 * Legacy ticket-operations module kept for backward compatibility.
 *
 * IMPORTANT: Agents must be API-only. Ticket operations run via HAL API endpoints
 * (server-side Supabase secret key).
 */

export interface CheckUnassignedResult {
  moved: string[]
  notReady: Array<{ id: string; title?: string; missingItems: string[] }>
  error?: string
}

export function isUnknownColumnError(): boolean {
  return false
}

export async function checkUnassignedTickets(): Promise<CheckUnassignedResult> {
  return {
    moved: [],
    notReady: [],
    error:
      'checkUnassignedTickets is no longer available in agent runtime. Use the server endpoint /api/pm/check-unassigned.',
  }
}

