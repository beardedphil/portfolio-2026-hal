/**
 * Role-based hard character budgets for Context Bundles.
 * 
 * These limits enforce maximum bundle sizes per agent role to ensure
 * prompt sizes stay within model context windows and cost constraints.
 */

export interface RoleBudget {
  role: string
  hardLimit: number
  displayName: string
}

/**
 * Hard character limits per role (inclusive).
 * These are enforced when generating bundles.
 */
export const ROLE_BUDGETS: Record<string, RoleBudget> = {
  'implementation-agent': {
    role: 'implementation-agent',
    hardLimit: 200_000, // 200k characters
    displayName: 'Implementation Agent',
  },
  'qa-agent': {
    role: 'qa-agent',
    hardLimit: 200_000, // 200k characters
    displayName: 'QA Agent',
  },
  'project-manager': {
    role: 'project-manager',
    hardLimit: 150_000, // 150k characters
    displayName: 'Project Manager',
  },
  'process-review': {
    role: 'process-review',
    hardLimit: 100_000, // 100k characters
    displayName: 'Process Review',
  },
}

/**
 * Gets the budget for a specific role.
 * 
 * @param role - The agent role identifier
 * @returns Role budget or null if role not found
 */
export function getRoleBudget(role: string): RoleBudget | null {
  return ROLE_BUDGETS[role] || null
}

/**
 * Gets all available role budgets.
 * 
 * @returns Array of all role budgets
 */
export function getAllRoleBudgets(): RoleBudget[] {
  return Object.values(ROLE_BUDGETS)
}

/**
 * Checks if a character count exceeds the role's hard limit.
 * 
 * @param role - The agent role identifier
 * @param characterCount - The character count to check
 * @returns True if count exceeds limit, false otherwise
 */
export function exceedsBudget(role: string, characterCount: number): boolean {
  const budget = getRoleBudget(role)
  if (!budget) {
    // Unknown role - allow but warn
    return false
  }
  return characterCount > budget.hardLimit
}

/**
 * Calculates the overage (how many characters over the limit).
 * 
 * @param role - The agent role identifier
 * @param characterCount - The character count to check
 * @returns Overage amount (0 if within limit)
 */
export function calculateOverage(role: string, characterCount: number): number {
  const budget = getRoleBudget(role)
  if (!budget) {
    return 0
  }
  return Math.max(0, characterCount - budget.hardLimit)
}
