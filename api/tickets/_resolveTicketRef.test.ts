/**
 * Unit tests for ticket reference resolution helper.
 * Tests the pure function that generates lookup strategies for resolving ticket IDs.
 */

import { describe, it, expect } from 'vitest'
import { resolveTicketRefStrategies, type TicketLookupStrategy } from './_resolveTicketRef.js'

describe('resolveTicketRefStrategies', () => {
  it('returns null for empty or whitespace-only input', () => {
    expect(resolveTicketRefStrategies('')).toBeNull()
    expect(resolveTicketRefStrategies('   ')).toBeNull()
    expect(resolveTicketRefStrategies(null)).toBeNull()
    expect(resolveTicketRefStrategies(undefined)).toBeNull()
  })

  it('generates strategies for simple numeric ID', () => {
    const strategies = resolveTicketRefStrategies('172')
    expect(strategies).toEqual([
      { type: 'id', value: '172' },
      { type: 'display_id', value: '172' },
    ])
  })

  it('generates strategies for numeric ID with leading zeros', () => {
    const strategies = resolveTicketRefStrategies('0172')
    expect(strategies).toEqual([
      { type: 'id', value: '0172' },
      { type: 'display_id', value: '0172' },
      { type: 'id', value: '172' }, // Strategy 4: without leading zeros
    ])
  })

  it('generates strategies for display ID format (e.g., HAL-0172)', () => {
    const strategies = resolveTicketRefStrategies('HAL-0172')
    expect(strategies).toEqual([
      { type: 'id', value: 'HAL-0172' }, // Strategy 1: as-is
      { type: 'display_id', value: 'HAL-0172' }, // Strategy 2: by display_id
      { type: 'id', value: '172' }, // Strategy 3: extract numeric, remove leading zeros
    ])
  })

  it('generates strategies for display ID without leading zeros', () => {
    const strategies = resolveTicketRefStrategies('HAL-172')
    expect(strategies).toEqual([
      { type: 'id', value: 'HAL-172' },
      { type: 'display_id', value: 'HAL-172' },
      { type: 'id', value: '172' }, // Strategy 3: extract numeric part
    ])
  })

  it('handles different prefix formats', () => {
    const strategies = resolveTicketRefStrategies('PROJ-001')
    expect(strategies).toEqual([
      { type: 'id', value: 'PROJ-001' },
      { type: 'display_id', value: 'PROJ-001' },
      { type: 'id', value: '1' }, // Leading zeros removed: "001" -> "1"
    ])
  })

  it('handles display ID with all zeros after prefix', () => {
    const strategies = resolveTicketRefStrategies('HAL-000')
    expect(strategies).toEqual([
      { type: 'id', value: 'HAL-000' },
      { type: 'display_id', value: 'HAL-000' },
      { type: 'id', value: '000' }, // "000" -> "000" (empty after strip, so keep original)
    ])
  })

  it('handles display ID with single zero', () => {
    const strategies = resolveTicketRefStrategies('HAL-0')
    expect(strategies).toEqual([
      { type: 'id', value: 'HAL-0' },
      { type: 'display_id', value: 'HAL-0' },
      { type: 'id', value: '0' }, // "0" -> "0" (empty after strip, so keep original)
    ])
  })

  it('trims whitespace from input', () => {
    const strategies = resolveTicketRefStrategies('  172  ')
    expect(strategies).toEqual([
      { type: 'id', value: '172' },
      { type: 'display_id', value: '172' },
    ])
  })

  it('does not add duplicate strategies', () => {
    // For "172", strategy 3 and 4 don't apply, so we only get 2 strategies
    const strategies = resolveTicketRefStrategies('172')
    expect(strategies).toHaveLength(2)
    expect(strategies).toEqual([
      { type: 'id', value: '172' },
      { type: 'display_id', value: '172' },
    ])
  })

  it('handles numeric string that is all zeros', () => {
    const strategies = resolveTicketRefStrategies('000')
    expect(strategies).toEqual([
      { type: 'id', value: '000' },
      { type: 'display_id', value: '000' },
      // Strategy 4 doesn't add duplicate (withoutLeadingZeros === trimmed)
    ])
  })

  it('handles single zero', () => {
    const strategies = resolveTicketRefStrategies('0')
    expect(strategies).toEqual([
      { type: 'id', value: '0' },
      { type: 'display_id', value: '0' },
      // Strategy 4 applies (starts with '0'), but result is same as original, so not added
    ])
  })

  it('handles display ID with multiple leading zeros', () => {
    const strategies = resolveTicketRefStrategies('HAL-000172')
    expect(strategies).toEqual([
      { type: 'id', value: 'HAL-000172' },
      { type: 'display_id', value: 'HAL-000172' },
      { type: 'id', value: '172' }, // "000172" -> "172"
    ])
  })

  it('handles numeric with multiple leading zeros', () => {
    const strategies = resolveTicketRefStrategies('000172')
    expect(strategies).toEqual([
      { type: 'id', value: '000172' },
      { type: 'display_id', value: '000172' },
      { type: 'id', value: '172' }, // Strategy 4: without leading zeros
    ])
  })

  it('handles display ID format that does not match pattern', () => {
    // This should not trigger strategy 3 (no prefix match)
    const strategies = resolveTicketRefStrategies('hal-172') // lowercase prefix
    expect(strategies).toEqual([
      { type: 'id', value: 'hal-172' },
      { type: 'display_id', value: 'hal-172' },
      // Strategy 3 doesn't apply (lowercase prefix doesn't match /^[A-Z]+-/)
    ])
  })

  it('handles mixed case display ID', () => {
    const strategies = resolveTicketRefStrategies('HAL-0172')
    expect(strategies).toEqual([
      { type: 'id', value: 'HAL-0172' },
      { type: 'display_id', value: 'HAL-0172' },
      { type: 'id', value: '172' },
    ])
  })

  it('generates correct order of strategies', () => {
    // The order matters: we want to try most specific first
    const strategies = resolveTicketRefStrategies('HAL-0172')
    expect(strategies).toHaveLength(3)
    expect(strategies![0]).toEqual({ type: 'id', value: 'HAL-0172' })
    expect(strategies![1]).toEqual({ type: 'display_id', value: 'HAL-0172' })
    expect(strategies![2]).toEqual({ type: 'id', value: '172' })
  })
})
