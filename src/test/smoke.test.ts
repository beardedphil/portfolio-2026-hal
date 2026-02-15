import { describe, it, expect } from 'vitest'

/**
 * Smoke test to verify Vitest is configured correctly.
 * This test ensures the test harness is working so future refactors can be done safely.
 */
describe('Smoke test', () => {
  it('should pass a basic assertion', () => {
    expect(true).toBe(true)
  })

  it('should handle basic arithmetic', () => {
    expect(1 + 1).toBe(2)
  })

  it('should verify test environment is set up', () => {
    expect(typeof window).toBe('object')
  })
})
