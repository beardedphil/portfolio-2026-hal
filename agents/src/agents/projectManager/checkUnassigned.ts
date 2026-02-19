/**
 * Legacy helper entry point kept for backward compatibility.
 *
 * IMPORTANT: Agents must be API-only. Unassigned checks should run server-side.
 */

export type CheckUnassignedResult = {
  moved: string[]
  notReady: Array<{ id: string; title?: string; missingItems: string[] }>
  error?: string
}

export async function checkUnassignedTickets(): Promise<CheckUnassignedResult> {
  return {
    moved: [],
    notReady: [],
    error:
      'checkUnassignedTickets is no longer available in agent runtime. Run the server endpoint /api/pm/check-unassigned instead.',
  }
}

