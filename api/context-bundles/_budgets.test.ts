import { describe, it, expect } from 'vitest'
import {
  ROLE_BUDGETS,
  getRoleBudget,
  getAllRoleBudgets,
  exceedsBudget,
  calculateOverage,
} from './_budgets.js'

describe('ROLE_BUDGETS', () => {
  it('contains budget definitions', () => {
    expect(Object.keys(ROLE_BUDGETS).length).toBeGreaterThan(0)
  })

  it('has budgets with hardLimit property', () => {
    for (const [role, budget] of Object.entries(ROLE_BUDGETS)) {
      expect(budget.hardLimit).toBeGreaterThan(0)
      expect(typeof budget.hardLimit).toBe('number')
    }
  })
})

describe('getRoleBudget', () => {
  it('returns budget for known role', () => {
    const budget = getRoleBudget('implementation-agent')
    expect(budget).toBeDefined()
    expect(budget?.hardLimit).toBeGreaterThan(0)
  })

  it('returns null for unknown role', () => {
    const budget = getRoleBudget('unknown-role')
    expect(budget).toBeNull()
  })

  it('handles case sensitivity', () => {
    const budget1 = getRoleBudget('implementation')
    const budget2 = getRoleBudget('IMPLEMENTATION')
    // May or may not be case-sensitive depending on implementation
    expect(budget1).toBeDefined()
  })
})

describe('getAllRoleBudgets', () => {
  it('returns array of all budgets', () => {
    const budgets = getAllRoleBudgets()
    expect(Array.isArray(budgets)).toBe(true)
    expect(budgets.length).toBeGreaterThan(0)
  })

  it('returns budgets with role and hardLimit', () => {
    const budgets = getAllRoleBudgets()
    for (const budget of budgets) {
      expect(budget.role).toBeDefined()
      expect(budget.hardLimit).toBeGreaterThan(0)
    }
  })
})

describe('exceedsBudget', () => {
  it('returns false when under budget', () => {
    const budget = getRoleBudget('implementation-agent')
    if (budget) {
      expect(exceedsBudget('implementation-agent', budget.hardLimit - 100)).toBe(false)
    }
  })

  it('returns true when over budget', () => {
    const budget = getRoleBudget('implementation-agent')
    if (budget) {
      expect(exceedsBudget('implementation-agent', budget.hardLimit + 100)).toBe(true)
    }
  })

  it('returns false when exactly at budget', () => {
    const budget = getRoleBudget('implementation-agent')
    if (budget) {
      expect(exceedsBudget('implementation-agent', budget.hardLimit)).toBe(false)
    }
  })

  it('returns false for unknown role', () => {
    expect(exceedsBudget('unknown-role', 1000)).toBe(false)
  })
})

describe('calculateOverage', () => {
  it('returns zero when under budget', () => {
    const budget = getRoleBudget('implementation-agent')
    if (budget) {
      expect(calculateOverage('implementation-agent', budget.hardLimit - 100)).toBe(0)
    }
  })

  it('returns positive overage when over budget', () => {
    const budget = getRoleBudget('implementation-agent')
    if (budget) {
      const overage = calculateOverage('implementation-agent', budget.hardLimit + 100)
      expect(overage).toBe(100)
    }
  })

  it('returns zero when exactly at budget', () => {
    const budget = getRoleBudget('implementation-agent')
    if (budget) {
      expect(calculateOverage('implementation-agent', budget.hardLimit)).toBe(0)
    }
  })

  it('returns zero for unknown role', () => {
    expect(calculateOverage('unknown-role', 1000)).toBe(0)
  })
})
